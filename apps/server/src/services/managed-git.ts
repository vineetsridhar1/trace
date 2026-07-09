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

// Runtime tokens live as long as a provisioned runtime bridge (matches the
// 30-day provisioned-runtime token). The session/runtime binding is re-checked
// on every git request, so expiry is a backstop, not the only revocation.
const RUNTIME_GIT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
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
};

export type ManagedGitAuth = Omit<ManagedGitTokenPayload, "tokenType">;

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
    const repo = await prisma.repo.create({
      data: {
        name: input.name,
        provider: "managed",
        defaultBranch,
        organizationId: input.organizationId,
      },
    });

    // Remote URL embeds the repo id, so it's only knowable after the row exists.
    const remoteUrl = buildManagedGitUrl(input.organizationId, repo.id);
    try {
      await gitStorage.initBareRepo(input.organizationId, repo.id, { defaultBranch });
    } catch (error) {
      // Roll back the row so a failed init doesn't strand an unusable managed
      // repo the caller would then try to reuse.
      await prisma.repo.delete({ where: { id: repo.id } }).catch(() => {});
      throw error;
    }

    const persisted = await prisma.repo.update({
      where: { id: repo.id },
      data: { remoteUrl },
    });

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
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSeconds });
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
        !payload.capabilities.every((c) => c === "read" || c === "write")
      ) {
        return null;
      }
      return {
        organizationId: payload.organizationId,
        repoId: payload.repoId,
        scope: payload.scope,
        capabilities: payload.capabilities,
        subject: payload.subject,
      };
    } catch {
      return null;
    }
  }

  /**
   * Authorize a smart-HTTP request: the token must be valid, bound to this
   * org+repo, and carry the capability the service needs (write for push, read
   * for fetch). Throws AuthorizationError on any mismatch.
   */
  authorizeRequest(input: {
    token: string | null;
    organizationId: string;
    repoId: string;
    service: GitService;
  }): ManagedGitAuth {
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
