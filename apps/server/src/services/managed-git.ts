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

const JWT_SECRET = resolveJwtSecret();

// Runtime liveness is checked against the session's persisted connection on
// every request; the TTL is a second, bounded backstop.
const RUNTIME_GIT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
// User clone/export tokens are short-lived and auditable — minted on demand for
// an explicit download/clone action.
const USER_GIT_TOKEN_TTL_SECONDS = 60 * 60;

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
    return connection.runtimeInstanceId === auth.subject && connection.state === "connected";
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
      void this.publishDesignCommitPreview({
        organizationId: input.organizationId,
        repoId: input.repoId,
        branch,
        commitSha: command.newSha,
      });
    }
  }

  private async publishDesignCommitPreview(input: {
    organizationId: string;
    repoId: string;
    branch: string;
    commitSha: string;
  }): Promise<void> {
    const groups = await prisma.sessionGroup.findMany({
      where: {
        organizationId: input.organizationId,
        repoId: input.repoId,
        branch: input.branch,
        kind: "design",
      },
      select: { id: true, ownerUserId: true },
    });

    await Promise.all(
      groups.map(async (group) => {
        await prisma.sessionGroup.update({
          where: { id: group.id },
          data: {
            designPreviewStatus: "pending",
            designPreviewKey: null,
            designPreviewCommitSha: input.commitSha,
            designPreviewCapturedAt: null,
          },
        });
        const preview = await designCheckpointPreviewService.publishCommit({
          organizationId: input.organizationId,
          sessionGroupId: group.id,
          commitSha: input.commitSha,
          userId: group.ownerUserId,
        });
        // A later push may already be exporting. Do not let an older export
        // overwrite the preview selected for the newest pushed revision.
        await prisma.sessionGroup.updateMany({
          where: { id: group.id, designPreviewCommitSha: input.commitSha },
          data: {
            designPreviewStatus: preview.previewStatus,
            designPreviewKey: preview.previewKey ?? null,
            designPreviewCapturedAt: preview.previewCapturedAt ?? null,
          },
        });
      }),
    ).catch((error: unknown) => {
      console.error("[managed-git] design commit preview publish failed", error);
    });
  }
}

export const managedGitService = new ManagedGitService();
