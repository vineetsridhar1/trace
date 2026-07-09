import { randomUUID } from "crypto";
import type { Repo } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db.js";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { gitStorage } from "../lib/git-storage/index.js";
import {
  classifyRefUpdate,
  serviceRequiresWrite,
  type GitService,
  type ReceivePackCommand,
} from "../lib/git-http.js";
import { eventService } from "./event.js";

const JWT_SECRET = resolveJwtSecret();

// Runtime tokens are bounded rather than long-lived: a leaked token should not
// stay valid for weeks. Consumers minting for a runtime should pass an explicit
// `ttlSeconds` matching the runtime's expected lifetime, and register a
// validator (see `setRequestValidator`) to enforce liveness/revocation — TTL is
// only a backstop.
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
  /** Session this token is bound to, when minted for a session's runtime. */
  sessionId?: string;
};

export type ManagedGitAuth = Omit<ManagedGitTokenPayload, "tokenType">;

/**
 * Optional per-request liveness/revocation check. The session service registers
 * one so that a token whose runtime/session has ended (or been revoked) stops
 * working before its TTL — satisfying "tokens expire with the runtime" without
 * coupling this transport layer to session internals. Returning false denies.
 */
export type GitRequestValidator = (auth: ManagedGitAuth) => Promise<boolean> | boolean;

function managedGitBaseUrl(): string {
  const explicit = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  // Local/dev fallback so managed remotes resolve without extra config.
  const port = process.env.PORT ?? "4000";
  return `http://localhost:${port}`;
}

/** The smart-HTTP clone URL a runtime/bridge points `origin` at. */
export function buildManagedGitUrl(organizationId: string, repoId: string): string {
  return `${managedGitBaseUrl()}/git/${organizationId}/${repoId}.git`;
}

class ManagedGitService {
  private requestValidator: GitRequestValidator | null = null;

  /**
   * Register a per-request liveness/revocation check (see GitRequestValidator).
   * Called once at startup by the consumer that owns runtime/session lifecycle.
   */
  setRequestValidator(validator: GitRequestValidator | null): void {
    this.requestValidator = validator;
  }

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

    await gitStorage.initBareRepo(input.organizationId, id, { defaultBranch });

    let persisted: Repo;
    try {
      persisted = await prisma.repo.create({
        data: {
          id,
          name: input.name,
          provider: "managed",
          defaultBranch,
          organizationId: input.organizationId,
          remoteUrl,
        },
      });
    } catch (error) {
      // The row is the source of truth; if it can't be written, clean up the
      // orphaned bare repo so storage doesn't leak.
      await gitStorage.deleteRepo(input.organizationId, id).catch(() => {});
      throw error;
    }

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "system",
      scopeId: persisted.id,
      eventType: "repo_created",
      payload: {
        repo: {
          id: persisted.id,
          name: persisted.name,
          provider: persisted.provider,
          remoteUrl: persisted.remoteUrl,
          defaultBranch: persisted.defaultBranch,
          webhookActive: false,
        },
      },
      actorType: input.actorType,
      actorId: input.actorId,
    });

    return persisted;
  }

  /** Resolve a managed repo scoped to its org. Returns null for missing/non-managed. */
  async getManagedRepo(organizationId: string, repoId: string): Promise<Repo | null> {
    return prisma.repo.findFirst({
      where: { id: repoId, organizationId, provider: "managed" },
    });
  }

  mintAccessToken(input: {
    organizationId: string;
    repoId: string;
    scope: GitTokenScope;
    subject: string;
    capabilities: GitCapability[];
    sessionId?: string;
    ttlSeconds?: number;
  }): { token: string; expiresAt: Date } {
    if (input.capabilities.length === 0) {
      throw new ValidationError("A managed git token needs at least one capability");
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
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSeconds });
    // Audit trail for credential issuance — never logs the token itself.
    console.log(
      `[managed-git] minted ${input.scope} token repo=${input.repoId} org=${input.organizationId} ` +
        `subject=${input.subject} caps=${payload.capabilities.join(",")} ttl=${ttlSeconds}s` +
        (input.sessionId ? ` session=${input.sessionId}` : ""),
    );
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  verifyAccessToken(token: string): ManagedGitAuth | null {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as unknown as ManagedGitTokenPayload;
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
        (payload.sessionId !== undefined && typeof payload.sessionId !== "string")
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
   * fetch), and pass the registered liveness validator if any. Throws
   * AuthorizationError on any mismatch. Does not touch the database — callers
   * check repo existence separately, so this can run before that lookup.
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
    if (this.requestValidator && !(await this.requestValidator(auth))) {
      throw new AuthorizationError("Managed git token is no longer valid");
    }
    return auth;
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
    commands: ReceivePackCommand[];
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
  }
}

export const managedGitService = new ManagedGitService();
