import { randomUUID } from "crypto";
import { Prisma, type Repo } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db.js";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { gitStorage } from "../lib/git-storage/index.js";
import {
  classifyRefUpdate,
  serviceRequiresWrite,
  type GitRefUpdate,
  type GitService,
} from "../lib/git-http.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { designCheckpointPreviewService } from "./design-checkpoint-preview.js";
import { storage } from "../lib/storage/index.js";
import { sessionRouter } from "../lib/session-router.js";
import {
  parsePdfPageFormat,
  validatePdfPageFormat,
  type PdfPageFormat,
} from "../lib/pdf-format.js";
import { designSystemService } from "./design-system.js";
import { animationCommitPreviewUrl } from "../lib/animation-preview-url.js";

const JWT_SECRET = resolveJwtSecret();

// Runtime liveness is checked against the session's persisted connection on
// every request; the TTL is a second, bounded backstop.
const RUNTIME_GIT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
// User clone/export tokens are short-lived and auditable — minted on demand for
// an explicit download/clone action.
const USER_GIT_TOKEN_TTL_SECONDS = 60 * 60;
// This exceeds the export request timeout so the reconciler never reclaims a
// still-running export from another API task.
const DESIGN_PREVIEW_RETRY_DELAY_MS = 90_000;
const PDF_EXPORT_RETRY_DELAY_MS = 90_000;
const ANIMATION_PREVIEW_RETRY_DELAY_MS = 90_000;

function isPdfStorageKeyForGroup(key: string, organizationId: string, sessionGroupId: string) {
  return key.startsWith(`pdf-exports/${organizationId}/${sessionGroupId}/`);
}

async function deletePdfObject(key: string): Promise<void> {
  try {
    await storage.deleteObject(key);
  } catch (error) {
    console.warn("[managed-git] failed to delete superseded PDF object", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function isAnimationStorageKeyForGroup(key: string, organizationId: string, sessionGroupId: string) {
  return key.startsWith(`animation-previews/${organizationId}/${sessionGroupId}/`);
}

async function deleteAnimationObject(key: string): Promise<void> {
  try {
    await storage.deleteObject(key);
  } catch (error) {
    console.warn("[managed-git] failed to delete superseded animation preview object", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type GitCapability = "read" | "write";
export type GitTokenScope = "runtime" | "user";

type ManagedGitTokenPayload = {
  tokenType: "managed_git";
  organizationId: string;
  repoId: string;
  scope: GitTokenScope;
  capabilities: GitCapability[];
  /** userId (user scope) or runtime instance id (runtime scope). */
  subject: string;
  /** Session this token is bound to for a runtime-scoped credential. */
  sessionId?: string;
};

export type ManagedGitAuth = Omit<ManagedGitTokenPayload, "tokenType">;

type MintAccessTokenInput = {
  organizationId: string;
  repoId: string;
  subject: string;
  capabilities: GitCapability[];
  actorType: ActorType;
  actorId: string;
  ttlSeconds?: number;
} & ({ scope: "runtime"; sessionId: string } | { scope: "user"; sessionId?: never });

function managedGitBaseUrl(): string {
  const explicit = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  // Local/dev fallback so managed remotes resolve without extra config. A
  // remote runtime (cloud/Fly) cannot reach the server's own localhost, so the
  // origin it's given would be dead — warn loudly rather than fail silently at
  // push time with a confusing "repository not found".
  const port = process.env.PORT ?? "4000";
  console.warn(
    `[managed-git] TRACE_SERVER_PUBLIC_URL is unset; managed git origins fall back to http://localhost:${port}. ` +
      "Cloud runtimes cannot reach this and their checkpoint pushes will fail. Set TRACE_SERVER_PUBLIC_URL to a URL the runtime can reach back on.",
  );
  return `http://localhost:${port}`;
}

/** The smart-HTTP clone URL a runtime/bridge points `origin` at. */
export function buildManagedGitUrl(organizationId: string, repoId: string): string {
  return `${managedGitBaseUrl()}/git/${organizationId}/${repoId}.git`;
}

class ManagedGitService {
  /**
   * Create a hidden Trace-managed repo and initialize its bare git storage.
   * Idempotent at the storage layer (init is a no-op if the bare repo exists),
   * but the caller owns higher-level dedup — a design/app session must check its
   * existing `sessionGroup.repoId` before creating a new managed repo.
   */
  async createManagedRepo(input: {
    organizationId: string;
    name: string;
    actorType: ActorType;
    actorId: string;
    defaultBranch?: string;
  }): Promise<Repo> {
    const defaultBranch = input.defaultBranch?.trim() || "main";
    // Generate the id up front so the remote URL and bare repo can be created
    // before the row, letting the row be written once with everything set —
    // no create-then-update window where a half-built repo could be observed.
    const id = randomUUID();
    const remoteUrl = buildManagedGitUrl(input.organizationId, id);

    // Authorize before creating filesystem state. The later transaction remains
    // the atomic boundary for the database row and its event.
    await prisma.$transaction((tx: Prisma.TransactionClient) =>
      assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId),
    );
    await gitStorage.initBareRepo(input.organizationId, id, { defaultBranch });

    let persisted: Repo;
    let createdEvent: Awaited<ReturnType<typeof eventService.create>>;
    try {
      [persisted, createdEvent] = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const repo = await tx.repo.create({
            data: {
              id,
              name: input.name,
              provider: "managed",
              defaultBranch,
              organizationId: input.organizationId,
              remoteUrl,
            },
          });
          const event = await eventService.create(
            {
              organizationId: input.organizationId,
              scopeType: "system",
              scopeId: repo.id,
              eventType: "repo_created",
              payload: {
                repo: {
                  id: repo.id,
                  name: repo.name,
                  provider: repo.provider,
                  remoteUrl: repo.remoteUrl,
                  defaultBranch: repo.defaultBranch,
                  webhookActive: false,
                },
              },
              actorType: input.actorType,
              actorId: input.actorId,
              deferPublish: true,
            },
            tx,
          );
          return [repo, event] as const;
        },
      );
    } catch (error) {
      // The row is the source of truth; if it can't be written, clean up the
      // orphaned bare repo so storage doesn't leak.
      await gitStorage.deleteRepo(input.organizationId, id).catch(() => {});
      throw error;
    }
    eventService.publishCreated(createdEvent);

    return persisted;
  }

  /** Resolve a managed repo scoped to its org. Returns null for missing/non-managed. */
  async getManagedRepo(organizationId: string, repoId: string): Promise<Repo | null> {
    return prisma.repo.findFirst({
      where: { id: repoId, organizationId, provider: "managed" },
    });
  }

  /** Delete a managed repo row and its bare git storage. */
  async deleteManagedRepo(input: {
    organizationId: string;
    repoId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<boolean> {
    const repo = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);
      const managedRepo = await tx.repo.findFirst({
        where: {
          id: input.repoId,
          organizationId: input.organizationId,
          provider: "managed",
        },
        select: { id: true },
      });
      if (!managedRepo) return null;
      await tx.repo.delete({ where: { id: managedRepo.id } });
      return managedRepo;
    });
    if (!repo) return false;

    // The row is the source of truth and is already gone; a storage-delete
    // failure must not fail the surrounding group deletion. Worst case is a
    // leaked bare dir, which is far less harmful than a half-deleted group.
    await gitStorage.deleteRepo(input.organizationId, repo.id).catch((error) => {
      console.warn(
        `[managed-git] failed to delete bare storage for repo ${repo.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    });
    return true;
  }

  async mintAccessToken(input: MintAccessTokenInput): Promise<{ token: string; expiresAt: Date }> {
    if (input.capabilities.length === 0) {
      throw new ValidationError("A managed git token needs at least one capability");
    }
    if (input.scope === "user" && (input.actorType !== "user" || input.actorId !== input.subject)) {
      throw new AuthorizationError("User managed git tokens must be minted for the current user");
    }
    const ttlSeconds =
      input.ttlSeconds ??
      (input.scope === "runtime" ? RUNTIME_GIT_TOKEN_TTL_SECONDS : USER_GIT_TOKEN_TTL_SECONDS);
    const payload: ManagedGitTokenPayload = {
      tokenType: "managed_git",
      organizationId: input.organizationId,
      repoId: input.repoId,
      scope: input.scope,
      capabilities: Array.from(new Set(input.capabilities)),
      subject: input.subject,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    };
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: ttlSeconds,
      algorithm: "HS256",
    });
    const auditEvent = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);
      await tx.repo.findFirstOrThrow({
        where: { id: input.repoId, organizationId: input.organizationId, provider: "managed" },
        select: { id: true },
      });
      return eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.repoId,
          eventType: "managed_git_token_minted",
          payload: {
            repoId: input.repoId,
            scope: input.scope,
            subject: input.subject,
            capabilities: payload.capabilities,
            expiresAt: expiresAt.toISOString(),
            ...(input.scope === "runtime" ? { sessionId: input.sessionId } : {}),
          },
          actorType: input.actorType,
          actorId: input.actorId,
          deferPublish: true,
        },
        tx,
      );
    });
    eventService.publishCreated(auditEvent);
    return { token, expiresAt };
  }

  verifyAccessToken(token: string): ManagedGitAuth | null {
    try {
      const payload = jwt.verify(token, JWT_SECRET, {
        algorithms: ["HS256"],
      }) as unknown as ManagedGitTokenPayload;
      if (
        !payload ||
        typeof payload !== "object" ||
        payload.tokenType !== "managed_git" ||
        typeof payload.organizationId !== "string" ||
        typeof payload.repoId !== "string" ||
        (payload.scope !== "runtime" && payload.scope !== "user") ||
        typeof payload.subject !== "string" ||
        !Array.isArray(payload.capabilities) ||
        !payload.capabilities.every((c) => c === "read" || c === "write") ||
        (payload.scope === "runtime" && typeof payload.sessionId !== "string") ||
        (payload.scope === "user" && payload.sessionId !== undefined)
      ) {
        return null;
      }
      return {
        organizationId: payload.organizationId,
        repoId: payload.repoId,
        scope: payload.scope,
        capabilities: payload.capabilities,
        subject: payload.subject,
        ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
      };
    } catch {
      return null;
    }
  }

  /**
   * Authorize a smart-HTTP request: the token must be valid, bound to this
   * org+repo, carry the capability the service needs (write for push, read for
   * fetch), and still belong to a live runtime when runtime-scoped. Throws
   * AuthorizationError on any mismatch.
   */
  async authorizeRequest(input: {
    token: string | null;
    organizationId: string;
    repoId: string;
    service: GitService;
  }): Promise<ManagedGitAuth> {
    if (!input.token) throw new AuthorizationError("Managed git request is missing credentials");
    const auth = this.verifyAccessToken(input.token);
    if (!auth) throw new AuthorizationError("Invalid managed git token");
    if (auth.organizationId !== input.organizationId || auth.repoId !== input.repoId) {
      throw new AuthorizationError("Managed git token is not scoped to this repo");
    }
    const needsWrite = serviceRequiresWrite(input.service);
    const hasWrite = auth.capabilities.includes("write");
    const hasRead = auth.capabilities.includes("read") || hasWrite;
    if (needsWrite ? !hasWrite : !hasRead) {
      console.warn("[managed-git] authorize denied: missing capability", {
        service: input.service,
        needsWrite,
        scope: auth.scope,
        subject: auth.subject,
        capabilities: auth.capabilities,
        repoId: input.repoId,
      });
      throw new AuthorizationError("Managed git token lacks the required capability");
    }
    if (auth.scope === "runtime" && !(await this.isLiveRuntimeBinding(auth))) {
      throw new AuthorizationError("Managed git token is no longer valid");
    }
    return auth;
  }

  private async isLiveRuntimeBinding(auth: ManagedGitAuth): Promise<boolean> {
    if (!auth.sessionId) return false;
    const session = await prisma.session.findFirst({
      where: { id: auth.sessionId, organizationId: auth.organizationId },
      select: {
        repoId: true,
        connection: true,
        sessionGroup: { select: { repoId: true } },
      },
    });
    if (
      !session ||
      (session.repoId !== auth.repoId && session.sessionGroup?.repoId !== auth.repoId)
    ) {
      return false;
    }
    if (
      !session.connection ||
      typeof session.connection !== "object" ||
      Array.isArray(session.connection)
    ) {
      return false;
    }
    const connection = session.connection as Record<string, unknown>;
    const live = connection.runtimeInstanceId === auth.subject && connection.state === "connected";
    if (!live) {
      // Diagnostic for push 403s: shows exactly which side is stale — the
      // token's runtime instance vs. the session's current live runtime/state.
      console.warn("[managed-git] runtime binding mismatch (push will 403)", {
        sessionId: auth.sessionId,
        repoId: auth.repoId,
        tokenSubject: auth.subject,
        connectionRuntimeInstanceId: connection.runtimeInstanceId,
        connectionState: connection.state,
      });
    }
    return live;
  }

  /**
   * Post-receive hook: record that refs were pushed to a managed repo and emit
   * a `repo_updated` event so downstream services/clients can react. Consumers
   * (design artifact, app checkpoint flows) layer their own event handling on
   * top of the managed remote; this is the shared transport-level signal.
   */
  async recordPush(input: {
    organizationId: string;
    repoId: string;
    commands: GitRefUpdate[];
    actorType: ActorType;
    actorId: string;
  }): Promise<void> {
    if (input.commands.length === 0) return;
    const refs = input.commands.map((command) => ({
      ref: command.ref,
      oldSha: command.oldSha,
      newSha: command.newSha,
      change: classifyRefUpdate(command),
    }));
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "system",
      scopeId: input.repoId,
      eventType: "repo_updated",
      payload: { repoId: input.repoId, provider: "managed", refs },
      actorType: input.actorType,
      actorId: input.actorId,
    });

    // A managed push is the durable source of truth for Design previews. This
    // deliberately does not create or depend on a Trace checkpoint.
    for (const command of input.commands) {
      if (!command.ref.startsWith("refs/heads/") || /^0+$/.test(command.newSha)) continue;
      const branch = command.ref.slice("refs/heads/".length);
      const artifactInput = {
        organizationId: input.organizationId,
        repoId: input.repoId,
        branch,
        commitSha: command.newSha,
      };
      await Promise.all([
        this.enqueueDesignCommitPreview(artifactInput).catch((error: unknown) => {
          console.error("[managed-git] failed to enqueue design preview", error);
        }),
        this.enqueuePdfCommitExport(artifactInput).catch((error: unknown) => {
          console.error("[managed-git] failed to enqueue PDF export", error);
        }),
        this.enqueueAnimationCommitExport(artifactInput).catch((error: unknown) => {
          console.error("[managed-git] failed to enqueue animation preview export", error);
        }),
        designSystemService
          .enqueueCommitArtifactsForManagedPush({
            ...artifactInput,
            oldSha: command.oldSha,
            newSha: command.newSha,
            actorType: input.actorType,
            actorId: input.actorId,
          })
          .catch((error: unknown) => {
            console.error("[managed-git] failed to persist design-system commits", error);
          }),
      ]);
    }
  }

  private async enqueuePdfCommitExport(input: {
    organizationId: string;
    repoId: string;
    branch: string;
    commitSha: string;
    reconcileCommittedFormat?: boolean;
  }): Promise<void> {
    let committedFormat: PdfPageFormat | null = null;
    const formatContent =
      input.reconcileCommittedFormat === false
        ? null
        : await gitStorage.readFileAtCommit(
            input.organizationId,
            input.repoId,
            input.commitSha,
            "document.format.json",
          );
    if (formatContent) {
      try {
        committedFormat = parsePdfPageFormat(formatContent);
      } catch (error) {
        console.warn("[managed-git] ignoring invalid committed PDF format", {
          repoId: input.repoId,
          commitSha: input.commitSha,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const groups = await prisma.sessionGroup.findMany({
      where: {
        organizationId: input.organizationId,
        repoId: input.repoId,
        OR: [
          { branch: input.branch },
          { branch: null, repo: { is: { defaultBranch: input.branch } } },
        ],
        kind: "pdf",
      },
      select: {
        id: true,
        branch: true,
        pdfPageWidth: true,
        pdfPageHeight: true,
        pdfPageUnit: true,
        pdfFormatVersion: true,
        pdfExportKey: true,
        pdfExportPendingKey: true,
        sessions: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, connection: true },
        },
      },
    });

    await Promise.all(
      groups.map(async (group) => {
        const formatChanged =
          committedFormat &&
          (group.pdfPageWidth !== committedFormat.width ||
            group.pdfPageHeight !== committedFormat.height ||
            group.pdfPageUnit !== committedFormat.unit);
        const formatVersion = group.pdfFormatVersion + (formatChanged ? 1 : 0);
        const format =
          committedFormat ??
          validatePdfPageFormat({
            width: group.pdfPageWidth,
            height: group.pdfPageHeight,
            unit: group.pdfPageUnit,
          });
        const exportKey = `pdf-exports/${input.organizationId}/${group.id}/${input.commitSha}-v${formatVersion}-${randomUUID()}.pdf`;
        const requestId = randomUUID();
        const publishing = await prisma.sessionGroup.update({
          where: { id: group.id },
          data: {
            ...(group.branch == null ? { branch: input.branch } : {}),
            ...(formatChanged
              ? {
                  pdfPageWidth: format.width,
                  pdfPageHeight: format.height,
                  pdfPageUnit: format.unit,
                  pdfFormatVersion: formatVersion,
                }
              : {}),
            pdfExportStatus: "publishing",
            pdfExportPendingKey: exportKey,
            pdfExportCommitSha: input.commitSha,
            pdfExportFormatVersion: formatVersion,
            pdfExportRequestId: requestId,
            pdfExportAttemptedAt: new Date(),
            pdfExportError: null,
          },
          select: {
            id: true,
            pdfExportStatus: true,
            pdfExportCommitSha: true,
            pdfExportCapturedAt: true,
            pdfExportError: true,
            pdfPageWidth: true,
            pdfPageHeight: true,
            pdfPageUnit: true,
            pdfFormatVersion: true,
          },
        });
        await this.emitPdfExportUpdate(input.organizationId, publishing);
        const uploadTarget = await storage.getUploadTarget(
          exportKey,
          "application/pdf",
          15 * 1024 * 1024,
        );
        if (group.pdfExportPendingKey && group.pdfExportPendingKey !== exportKey) {
          void deletePdfObject(group.pdfExportPendingKey);
        }
        const session = group.sessions.find((candidate) => {
          const connection = candidate.connection;
          return (
            connection &&
            typeof connection === "object" &&
            !Array.isArray(connection) &&
            (connection as Record<string, unknown>).state === "connected"
          );
        });
        if (!session) {
          await this.completePdfExport({
            organizationId: input.organizationId,
            sessionGroupId: group.id,
            commitSha: input.commitSha,
            requestId,
            storageKey: exportKey,
            error: "No connected PDF runtime",
          });
          return;
        }
        const connection = session.connection as Record<string, unknown>;
        const runtimeInstanceId =
          typeof connection.runtimeInstanceId === "string"
            ? connection.runtimeInstanceId
            : undefined;
        const delivery = sessionRouter.send(
          session.id,
          {
            type: "pdf_export",
            requestId,
            sessionId: session.id,
            sessionGroupId: group.id,
            commitSha: input.commitSha,
            format,
            storageKey: exportKey,
            uploadTarget,
          },
          { expectedHomeRuntimeId: runtimeInstanceId, organizationId: input.organizationId },
        );
        if (delivery !== "delivered") {
          await this.completePdfExport({
            organizationId: input.organizationId,
            sessionGroupId: group.id,
            commitSha: input.commitSha,
            requestId,
            storageKey: exportKey,
            error: `PDF runtime unavailable: ${delivery}`,
          });
        }
      }),
    );
  }

  async completePdfExport(input: {
    organizationId: string;
    sessionGroupId: string;
    commitSha: string;
    requestId: string;
    storageKey: string;
    error?: string;
  }): Promise<void> {
    const group = await prisma.sessionGroup.findFirst({
      where: {
        id: input.sessionGroupId,
        organizationId: input.organizationId,
        kind: "pdf",
        pdfExportCommitSha: input.commitSha,
        pdfExportRequestId: input.requestId,
      },
      select: { pdfExportPendingKey: true, pdfExportKey: true },
    });
    if (!group) {
      if (isPdfStorageKeyForGroup(input.storageKey, input.organizationId, input.sessionGroupId)) {
        void deletePdfObject(input.storageKey);
      }
      return;
    }
    if (group.pdfExportPendingKey !== input.storageKey) {
      if (isPdfStorageKeyForGroup(input.storageKey, input.organizationId, input.sessionGroupId)) {
        void deletePdfObject(input.storageKey);
      }
      return;
    }
    const completed = await prisma.sessionGroup.updateMany({
      where: {
        id: input.sessionGroupId,
        pdfExportCommitSha: input.commitSha,
        pdfExportRequestId: input.requestId,
        pdfExportPendingKey: input.storageKey,
      },
      data: input.error
        ? {
            pdfExportStatus: "failed",
            pdfExportPendingKey: null,
            pdfExportRequestId: null,
            pdfExportError: input.error.slice(0, 500),
          }
        : {
            pdfExportStatus: "captured",
            pdfExportKey: group.pdfExportPendingKey,
            pdfExportPendingKey: null,
            pdfExportRequestId: null,
            pdfExportCapturedAt: new Date(),
            pdfExportError: null,
          },
    });
    if (completed.count === 0) {
      if (isPdfStorageKeyForGroup(input.storageKey, input.organizationId, input.sessionGroupId)) {
        void deletePdfObject(input.storageKey);
      }
      return;
    }
    if (input.error && group.pdfExportPendingKey) {
      void deletePdfObject(group.pdfExportPendingKey);
    } else if (
      !input.error &&
      group.pdfExportKey &&
      group.pdfExportKey !== group.pdfExportPendingKey
    ) {
      void deletePdfObject(group.pdfExportKey);
    }
    const updated = await prisma.sessionGroup.findUniqueOrThrow({
      where: { id: input.sessionGroupId },
      select: {
        id: true,
        pdfExportStatus: true,
        pdfExportCommitSha: true,
        pdfExportCapturedAt: true,
        pdfExportError: true,
        pdfPageWidth: true,
        pdfPageHeight: true,
        pdfPageUnit: true,
        pdfFormatVersion: true,
      },
    });
    await this.emitPdfExportUpdate(input.organizationId, updated);
  }

  async retryPdfCommitExport(
    sessionGroupId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: {
        id: true,
        kind: true,
        organizationId: true,
        repoId: true,
        branch: true,
        pdfExportStatus: true,
        pdfExportKey: true,
        pdfExportCommitSha: true,
        pdfExportFormatVersion: true,
        pdfFormatVersion: true,
        pdfExportAttemptedAt: true,
        repo: { select: { defaultBranch: true } },
      },
    });
    if (!group || group.kind !== "pdf" || !group.repoId || !group.repo) return;

    const branch = group.branch ?? group.repo.defaultBranch;
    const refs = await gitStorage.listRefs(group.organizationId, group.repoId);
    const commitSha = refs.get(`refs/heads/${branch}`);
    if (!commitSha) return;
    const exportIsCurrent =
      group.pdfExportCommitSha === commitSha &&
      group.pdfExportFormatVersion === group.pdfFormatVersion;
    if (
      !options.force &&
      exportIsCurrent &&
      group.pdfExportStatus === "captured" &&
      group.pdfExportKey
    )
      return;
    if (
      !options.force &&
      exportIsCurrent &&
      group.pdfExportStatus === "publishing" &&
      group.pdfExportAttemptedAt &&
      group.pdfExportAttemptedAt.getTime() > Date.now() - PDF_EXPORT_RETRY_DELAY_MS
    )
      return;

    await this.enqueuePdfCommitExport({
      organizationId: group.organizationId,
      repoId: group.repoId,
      branch,
      commitSha,
      reconcileCommittedFormat: false,
    });
  }

  async updatePdfFormat(
    sessionGroupId: string,
    value: unknown,
    actor: { actorType: ActorType; actorId: string } = {
      actorType: "system",
      actorId: "system",
    },
  ): Promise<void> {
    const format = validatePdfPageFormat(value);
    const current = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: {
        id: true,
        kind: true,
        organizationId: true,
        pdfPageWidth: true,
        pdfPageHeight: true,
        pdfPageUnit: true,
      },
    });
    if (!current || current.kind !== "pdf") throw new ValidationError("PDF session not found");
    if (
      current.pdfPageWidth === format.width &&
      current.pdfPageHeight === format.height &&
      current.pdfPageUnit === format.unit
    )
      return;
    const updated = await prisma.sessionGroup.update({
      where: { id: sessionGroupId },
      data: {
        pdfPageWidth: format.width,
        pdfPageHeight: format.height,
        pdfPageUnit: format.unit,
        pdfFormatVersion: { increment: 1 },
        pdfExportStatus: "pending",
        pdfExportError: null,
      },
      select: {
        id: true,
        pdfExportStatus: true,
        pdfExportCommitSha: true,
        pdfExportCapturedAt: true,
        pdfExportError: true,
        pdfPageWidth: true,
        pdfPageHeight: true,
        pdfPageUnit: true,
        pdfFormatVersion: true,
      },
    });
    await this.emitPdfExportUpdate(current.organizationId, updated, actor);
    await this.retryPdfCommitExport(sessionGroupId, { force: true }).catch((error: unknown) => {
      console.error("[managed-git] failed to enqueue PDF export after a format update", error);
    });
  }

  async retryPendingPdfExports(sessionGroupId?: string): Promise<void> {
    const retryBefore = new Date(Date.now() - PDF_EXPORT_RETRY_DELAY_MS);
    const groups = await prisma.sessionGroup.findMany({
      where: {
        ...(sessionGroupId ? { id: sessionGroupId } : {}),
        kind: "pdf",
        OR: [
          { pdfExportStatus: { in: ["pending", "failed"] } },
          { pdfExportStatus: "publishing", pdfExportAttemptedAt: { lt: retryBefore } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    await Promise.all(groups.map((group) => this.retryPdfCommitExport(group.id, { force: true })));
  }

  private async emitPdfExportUpdate(
    organizationId: string,
    group: {
      id: string;
      pdfExportStatus: string | null;
      pdfExportCommitSha: string | null;
      pdfExportCapturedAt: Date | null;
      pdfExportError: string | null;
      pdfPageWidth: number;
      pdfPageHeight: number;
      pdfPageUnit: string;
      pdfFormatVersion: number;
    },
    actor: { actorType: ActorType; actorId: string } = {
      actorType: "system",
      actorId: "system",
    },
  ): Promise<void> {
    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: group.id,
      eventType: "pdf_export_updated",
      payload: {
        sessionGroupId: group.id,
        pdfExportStatus: group.pdfExportStatus,
        pdfExportCommitSha: group.pdfExportCommitSha,
        pdfExportCapturedAt: group.pdfExportCapturedAt?.toISOString() ?? null,
        pdfExportError: group.pdfExportError,
        pdfPageWidth: group.pdfPageWidth,
        pdfPageHeight: group.pdfPageHeight,
        pdfPageUnit: group.pdfPageUnit,
        pdfFormatVersion: group.pdfFormatVersion,
      },
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
  }

  private async enqueueAnimationCommitExport(input: {
    organizationId: string;
    repoId: string;
    branch: string;
    commitSha: string;
  }): Promise<void> {
    const groups = await prisma.sessionGroup.findMany({
      where: {
        organizationId: input.organizationId,
        repoId: input.repoId,
        OR: [
          { branch: input.branch },
          { branch: null, repo: { is: { defaultBranch: input.branch } } },
        ],
        kind: "animation",
      },
      select: {
        id: true,
        branch: true,
        animationPreviewPendingKey: true,
        sessions: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, connection: true },
        },
      },
    });

    await Promise.all(
      groups.map(async (group) => {
        const exportKey = `animation-previews/${input.organizationId}/${group.id}/${input.commitSha}-${randomUUID()}.html`;
        const requestId = randomUUID();
        const publishing = await prisma.sessionGroup.update({
          where: { id: group.id },
          data: {
            ...(group.branch == null ? { branch: input.branch } : {}),
            animationPreviewStatus: "publishing",
            animationPreviewPendingKey: exportKey,
            animationPreviewCommitSha: input.commitSha,
            animationPreviewRequestId: requestId,
            animationPreviewAttemptedAt: new Date(),
            animationPreviewError: null,
          },
          select: {
            id: true,
            animationPreviewStatus: true,
            animationPreviewKey: true,
            animationPreviewCommitSha: true,
            animationPreviewCapturedAt: true,
            animationPreviewError: true,
          },
        });
        await this.emitAnimationPreviewUpdate(input.organizationId, publishing);
        const uploadTarget = await storage.getUploadTarget(
          exportKey,
          "text/html; charset=utf-8",
          15 * 1024 * 1024,
        );
        if (group.animationPreviewPendingKey && group.animationPreviewPendingKey !== exportKey) {
          void deleteAnimationObject(group.animationPreviewPendingKey);
        }
        const session = group.sessions.find((candidate) => {
          const connection = candidate.connection;
          return (
            connection &&
            typeof connection === "object" &&
            !Array.isArray(connection) &&
            (connection as Record<string, unknown>).state === "connected"
          );
        });
        if (!session) {
          await this.completeAnimationExport({
            organizationId: input.organizationId,
            sessionGroupId: group.id,
            commitSha: input.commitSha,
            requestId,
            storageKey: exportKey,
            error: "No connected animation runtime",
          });
          return;
        }
        const connection = session.connection as Record<string, unknown>;
        const runtimeInstanceId =
          typeof connection.runtimeInstanceId === "string"
            ? connection.runtimeInstanceId
            : undefined;
        const delivery = sessionRouter.send(
          session.id,
          {
            type: "animation_export",
            requestId,
            sessionId: session.id,
            sessionGroupId: group.id,
            commitSha: input.commitSha,
            storageKey: exportKey,
            uploadTarget,
          },
          { expectedHomeRuntimeId: runtimeInstanceId, organizationId: input.organizationId },
        );
        if (delivery !== "delivered") {
          await this.completeAnimationExport({
            organizationId: input.organizationId,
            sessionGroupId: group.id,
            commitSha: input.commitSha,
            requestId,
            storageKey: exportKey,
            error: `Animation runtime unavailable: ${delivery}`,
          });
        }
      }),
    );
  }

  async completeAnimationExport(input: {
    organizationId: string;
    sessionGroupId: string;
    commitSha: string;
    requestId: string;
    storageKey: string;
    error?: string;
  }): Promise<void> {
    const group = await prisma.sessionGroup.findFirst({
      where: {
        id: input.sessionGroupId,
        organizationId: input.organizationId,
        kind: "animation",
        animationPreviewCommitSha: input.commitSha,
        animationPreviewRequestId: input.requestId,
      },
      select: { animationPreviewPendingKey: true, animationPreviewKey: true },
    });
    if (!group) {
      if (
        isAnimationStorageKeyForGroup(input.storageKey, input.organizationId, input.sessionGroupId)
      ) {
        void deleteAnimationObject(input.storageKey);
      }
      return;
    }
    if (group.animationPreviewPendingKey !== input.storageKey) {
      if (
        isAnimationStorageKeyForGroup(input.storageKey, input.organizationId, input.sessionGroupId)
      ) {
        void deleteAnimationObject(input.storageKey);
      }
      return;
    }
    const completed = await prisma.sessionGroup.updateMany({
      where: {
        id: input.sessionGroupId,
        animationPreviewCommitSha: input.commitSha,
        animationPreviewRequestId: input.requestId,
        animationPreviewPendingKey: input.storageKey,
      },
      data: input.error
        ? {
            animationPreviewStatus: "failed",
            animationPreviewPendingKey: null,
            animationPreviewRequestId: null,
            animationPreviewError: input.error.slice(0, 500),
          }
        : {
            animationPreviewStatus: "captured",
            animationPreviewKey: group.animationPreviewPendingKey,
            animationPreviewPendingKey: null,
            animationPreviewRequestId: null,
            animationPreviewCapturedAt: new Date(),
            animationPreviewError: null,
          },
    });
    if (completed.count === 0) {
      if (
        isAnimationStorageKeyForGroup(input.storageKey, input.organizationId, input.sessionGroupId)
      ) {
        void deleteAnimationObject(input.storageKey);
      }
      return;
    }
    if (input.error && group.animationPreviewPendingKey) {
      void deleteAnimationObject(group.animationPreviewPendingKey);
    } else if (
      !input.error &&
      group.animationPreviewKey &&
      group.animationPreviewKey !== group.animationPreviewPendingKey
    ) {
      void deleteAnimationObject(group.animationPreviewKey);
    }
    const updated = await prisma.sessionGroup.findUniqueOrThrow({
      where: { id: input.sessionGroupId },
      select: {
        id: true,
        animationPreviewStatus: true,
        animationPreviewKey: true,
        animationPreviewCommitSha: true,
        animationPreviewCapturedAt: true,
        animationPreviewError: true,
      },
    });
    await this.emitAnimationPreviewUpdate(input.organizationId, updated);
  }

  async retryAnimationCommitExport(
    sessionGroupId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: {
        id: true,
        kind: true,
        organizationId: true,
        repoId: true,
        branch: true,
        animationPreviewStatus: true,
        animationPreviewKey: true,
        animationPreviewCommitSha: true,
        animationPreviewAttemptedAt: true,
        repo: { select: { defaultBranch: true } },
      },
    });
    if (!group || group.kind !== "animation" || !group.repoId || !group.repo) return;

    const branch = group.branch ?? group.repo.defaultBranch;
    const refs = await gitStorage.listRefs(group.organizationId, group.repoId);
    const commitSha = refs.get(`refs/heads/${branch}`);
    if (!commitSha) return;
    const exportIsCurrent = group.animationPreviewCommitSha === commitSha;
    if (
      !options.force &&
      exportIsCurrent &&
      group.animationPreviewStatus === "captured" &&
      group.animationPreviewKey
    )
      return;
    if (
      !options.force &&
      exportIsCurrent &&
      group.animationPreviewStatus === "publishing" &&
      group.animationPreviewAttemptedAt &&
      group.animationPreviewAttemptedAt.getTime() > Date.now() - ANIMATION_PREVIEW_RETRY_DELAY_MS
    )
      return;

    await this.enqueueAnimationCommitExport({
      organizationId: group.organizationId,
      repoId: group.repoId,
      branch,
      commitSha,
    });
  }

  async retryPendingAnimationExports(sessionGroupId?: string): Promise<void> {
    const retryBefore = new Date(Date.now() - ANIMATION_PREVIEW_RETRY_DELAY_MS);
    const groups = await prisma.sessionGroup.findMany({
      where: {
        ...(sessionGroupId ? { id: sessionGroupId } : {}),
        kind: "animation",
        OR: [
          { animationPreviewStatus: { in: ["pending", "failed"] } },
          { animationPreviewStatus: "publishing", animationPreviewAttemptedAt: { lt: retryBefore } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    await Promise.all(
      groups.map((group) => this.retryAnimationCommitExport(group.id, { force: true })),
    );
  }

  private async emitAnimationPreviewUpdate(
    organizationId: string,
    group: {
      id: string;
      animationPreviewStatus: string | null;
      animationPreviewKey: string | null;
      animationPreviewCommitSha: string | null;
      animationPreviewCapturedAt: Date | null;
      animationPreviewError: string | null;
    },
    actor: { actorType: ActorType; actorId: string } = {
      actorType: "system",
      actorId: "system",
    },
  ): Promise<void> {
    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: group.id,
      eventType: "animation_preview_updated",
      payload: {
        sessionGroupId: group.id,
        animationPreviewStatus: group.animationPreviewStatus,
        animationPreviewUrl: group.animationPreviewKey
          ? animationCommitPreviewUrl(group.id)
          : null,
        animationPreviewCommitSha: group.animationPreviewCommitSha,
        animationPreviewCapturedAt: group.animationPreviewCapturedAt?.toISOString() ?? null,
        animationPreviewError: group.animationPreviewError,
      },
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
  }

  async retryPendingDesignCommitPreviews(sessionGroupId?: string): Promise<void> {
    const retryBefore = new Date(Date.now() - DESIGN_PREVIEW_RETRY_DELAY_MS);
    await prisma.sessionGroup.updateMany({
      where: {
        ...(sessionGroupId ? { id: sessionGroupId } : {}),
        kind: "design",
        designPreviewStatus: "publishing",
        designPreviewAttemptedAt: { lt: retryBefore },
      },
      data: { designPreviewStatus: "pending" },
    });
    const groups = await prisma.sessionGroup.findMany({
      where: {
        ...(sessionGroupId ? { id: sessionGroupId } : {}),
        kind: "design",
        designPreviewCommitSha: { not: null },
        designPreviewStatus: { in: ["pending", "failed", "unavailable"] },
        OR: [{ designPreviewAttemptedAt: null }, { designPreviewAttemptedAt: { lt: retryBefore } }],
      },
      select: { id: true, organizationId: true, ownerUserId: true, designPreviewCommitSha: true },
    });
    await Promise.all(
      groups.map((group) =>
        this.publishDesignCommitPreview({
          organizationId: group.organizationId,
          sessionGroupId: group.id,
          userId: group.ownerUserId,
          commitSha: group.designPreviewCommitSha!,
        }),
      ),
    );
  }

  private async enqueueDesignCommitPreview(input: {
    organizationId: string;
    repoId: string;
    branch: string;
    commitSha: string;
  }): Promise<void> {
    const groups = await prisma.sessionGroup.findMany({
      where: {
        organizationId: input.organizationId,
        repoId: input.repoId,
        OR: [
          { branch: input.branch },
          { branch: null, repo: { is: { defaultBranch: input.branch } } },
        ],
        kind: "design",
      },
      select: { id: true, ownerUserId: true, branch: true },
    });

    await Promise.all(
      groups.map(async (group) => {
        const pending = await prisma.sessionGroup.update({
          where: { id: group.id },
          data: {
            ...(group.branch == null ? { branch: input.branch } : {}),
            designPreviewStatus: "pending",
            designPreviewKey: null,
            designPreviewCommitSha: input.commitSha,
            designPreviewCapturedAt: null,
            designPreviewAttemptedAt: null,
          },
          select: { id: true, designPreviewStatus: true, designPreviewCommitSha: true },
        });
        await this.emitDesignPreviewUpdate(input.organizationId, pending);
        void this.publishDesignCommitPreview({
          organizationId: input.organizationId,
          sessionGroupId: group.id,
          commitSha: input.commitSha,
          userId: group.ownerUserId,
        }).catch((error: unknown) => {
          console.error("[managed-git] design commit preview publish failed", error);
        });
      }),
    );
  }

  private async publishDesignCommitPreview(input: {
    organizationId: string;
    sessionGroupId: string;
    userId: string;
    commitSha: string;
  }): Promise<void> {
    const attemptedAt = new Date();
    const claimed = await prisma.sessionGroup.updateMany({
      where: {
        id: input.sessionGroupId,
        designPreviewCommitSha: input.commitSha,
        designPreviewStatus: { in: ["pending", "failed", "unavailable"] },
      },
      data: { designPreviewStatus: "publishing", designPreviewAttemptedAt: attemptedAt },
    });
    if (claimed.count === 0) return;

    let preview: Awaited<ReturnType<typeof designCheckpointPreviewService.publishCommit>>;
    try {
      preview = await designCheckpointPreviewService.publishCommit(input);
    } catch (error) {
      console.error("[managed-git] design commit preview export failed", error);
      preview = { previewStatus: "failed", previewCapturedAt: new Date() };
    }
    const updated = await prisma.sessionGroup.updateMany({
      where: {
        id: input.sessionGroupId,
        designPreviewCommitSha: input.commitSha,
        designPreviewStatus: "publishing",
        designPreviewAttemptedAt: attemptedAt,
      },
      data: {
        designPreviewStatus: preview.previewStatus,
        designPreviewKey: preview.previewKey ?? null,
        designPreviewCapturedAt: preview.previewCapturedAt ?? null,
      },
    });
    if (updated.count > 0) {
      await this.emitDesignPreviewUpdate(input.organizationId, {
        id: input.sessionGroupId,
        designPreviewStatus: preview.previewStatus,
        designPreviewCommitSha: input.commitSha,
        designPreviewKey: preview.previewKey ?? null,
      });
    }
  }

  private async emitDesignPreviewUpdate(
    organizationId: string,
    sessionGroup: {
      id: string;
      designPreviewStatus: string | null;
      designPreviewCommitSha: string | null;
      designPreviewKey?: string | null;
    },
  ): Promise<void> {
    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: sessionGroup.id,
      eventType: "design_preview_updated",
      payload: {
        sessionGroupId: sessionGroup.id,
        designPreviewStatus: sessionGroup.designPreviewStatus,
        designPreviewCommitSha: sessionGroup.designPreviewCommitSha,
        designPreviewUrl: sessionGroup.designPreviewKey
          ? `/design-previews/groups/${encodeURIComponent(sessionGroup.id)}`
          : null,
      },
      actorType: "system",
      actorId: "system",
    });
  }
}

export const managedGitService = new ManagedGitService();
