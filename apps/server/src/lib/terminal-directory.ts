import { redis } from "./redis.js";
import { realtimeBackplane } from "./realtime-backplane.js";

const TERMINAL_PREFIX = "trace:terminal:v1";
const TERMINAL_SCOPE_PREFIX = "trace:terminal-scope:v1";
const TERMINAL_TTL_MS = 24 * 60 * 60 * 1000;

export type TerminalDescriptor = {
  terminalId: string;
  frontendReplicaId: string;
  kind: "session" | "channel";
  sessionId: string;
  sessionGroupId: string | null;
  channelId?: string;
  repoId?: string;
  ownerUserId: string | null;
  runtimeInstanceId: string;
  organizationId?: string;
  /**
   * Last known dimensions, cached here so a listing does not have to ask the
   * owning replica per terminal. Refreshed by `refreshDimensions` on resize —
   * the owning relay entry remains the source of truth.
   */
  cols?: number;
  rows?: number;
  expiresAt: number;
};

type CachedDescriptor = TerminalDescriptor & { cachedAt: number };

/** The scopes terminals are indexed under. One index shape for every listing. */
export type TerminalDirectoryScope = {
  kind: "session" | "group" | "channel";
  id: string;
};

export class TerminalDirectory {
  private descriptors = new Map<string, TerminalDescriptor>();

  register(input: Omit<TerminalDescriptor, "frontendReplicaId" | "expiresAt">): void {
    const descriptor: TerminalDescriptor = {
      ...input,
      frontendReplicaId: realtimeBackplane.replicaId,
      expiresAt: Date.now() + TERMINAL_TTL_MS,
    };
    this.descriptors.set(input.terminalId, descriptor);
    if (realtimeBackplane.enabled) {
      void redis
        .set(this.key(input.terminalId), JSON.stringify(descriptor), "PX", TERMINAL_TTL_MS)
        .catch((error) => console.error("[terminal-directory] register failed:", error));
      for (const scopeKey of this.scopeKeys(descriptor)) {
        void redis
          .sadd(scopeKey, descriptor.terminalId)
          .then(() => redis.pexpire(scopeKey, TERMINAL_TTL_MS))
          .catch((error) => console.error("[terminal-directory] scope index failed:", error));
      }
    }
  }

  async get(terminalId: string): Promise<TerminalDescriptor | undefined> {
    const cached = this.descriptors.get(terminalId);
    if (cached && cached.expiresAt > Date.now()) return cached;
    if (!realtimeBackplane.enabled) return undefined;
    return this.accept(terminalId, await redis.get(this.key(terminalId)));
  }

  /** Validate and cache a stored descriptor. Shared by the single and batched reads. */
  private accept(terminalId: string, value: string | null): TerminalDescriptor | undefined {
    if (!value) return undefined;
    try {
      const descriptor = JSON.parse(value) as TerminalDescriptor;
      if (
        descriptor.terminalId !== terminalId ||
        (descriptor.kind !== "session" && descriptor.kind !== "channel") ||
        typeof descriptor.sessionId !== "string" ||
        typeof descriptor.frontendReplicaId !== "string" ||
        typeof descriptor.runtimeInstanceId !== "string" ||
        typeof descriptor.expiresAt !== "number" ||
        descriptor.expiresAt <= Date.now()
      ) {
        return undefined;
      }
      this.descriptors.set(terminalId, descriptor);
      return descriptor;
    } catch {
      return undefined;
    }
  }

  /** Keep the cached dimensions in step with the owning relay entry. */
  refreshDimensions(terminalId: string, cols: number, rows: number): void {
    const cached = this.descriptors.get(terminalId);
    if (!cached || cached.frontendReplicaId !== realtimeBackplane.replicaId) return;
    if (cached.cols === cols && cached.rows === rows) return;
    const descriptor: TerminalDescriptor = { ...cached, cols, rows };
    this.descriptors.set(terminalId, descriptor);
    if (!realtimeBackplane.enabled) return;
    const ttl = Math.max(descriptor.expiresAt - Date.now(), 1);
    void redis
      .set(this.key(terminalId), JSON.stringify(descriptor), "PX", ttl)
      .catch((error) => console.error("[terminal-directory] dimension refresh failed:", error));
  }

  remove(terminalId: string): void {
    const cached = this.descriptors.get(terminalId);
    this.descriptors.delete(terminalId);
    if (realtimeBackplane.enabled) {
      void redis
        .del(this.key(terminalId))
        .catch((error) => console.error("[terminal-directory] remove failed:", error));
      // Scope members whose descriptor is gone are pruned lazily on read, so a
      // removal without a cached descriptor is still safe.
      for (const scopeKey of cached ? this.scopeKeys(cached) : []) {
        void redis
          .srem(scopeKey, terminalId)
          .catch((error) => console.error("[terminal-directory] scope prune failed:", error));
      }
    }
  }

  /**
   * Live descriptors for every terminal in a scope, including the ones owned by
   * other replicas. The relay's in-process indexes only see this replica's
   * terminals, so a list built from them alone flickers with whichever replica
   * served the request and invites duplicate terminals.
   */
  async listForScope(scope: TerminalDirectoryScope): Promise<TerminalDescriptor[]> {
    if (!realtimeBackplane.enabled) return [];
    const scopeKey = this.scopeKey(scope.kind, scope.id);
    let terminalIds: string[];
    try {
      terminalIds = await redis.smembers(scopeKey);
    } catch (error) {
      console.error("[terminal-directory] scope read failed:", error);
      return [];
    }
    if (terminalIds.length === 0) return [];

    let values: Array<string | null>;
    try {
      values = await redis.mget(terminalIds.map((terminalId) => this.key(terminalId)));
    } catch (error) {
      console.error("[terminal-directory] scope descriptor read failed:", error);
      return [];
    }

    const descriptors: TerminalDescriptor[] = [];
    const expired: string[] = [];
    terminalIds.forEach((terminalId, index) => {
      const descriptor = this.accept(terminalId, values[index] ?? null);
      if (descriptor) descriptors.push(descriptor);
      else expired.push(terminalId);
    });
    // Members whose descriptor has expired or was removed by a replica that
    // died mid-cleanup are pruned here, so the set self-heals on read.
    if (expired.length > 0) {
      void redis
        .srem(scopeKey, ...expired)
        .catch((error) => console.error("[terminal-directory] scope prune failed:", error));
    }
    return descriptors;
  }

  private scopeKeys(descriptor: TerminalDescriptor): string[] {
    const keys = [this.scopeKey("session", descriptor.sessionId)];
    if (descriptor.sessionGroupId) {
      keys.push(this.scopeKey("group", descriptor.sessionGroupId));
    }
    if (descriptor.channelId) {
      keys.push(this.scopeKey("channel", descriptor.channelId));
    }
    return keys;
  }

  private scopeKey(kind: TerminalDirectoryScope["kind"], id: string): string {
    return `${TERMINAL_SCOPE_PREFIX}:${kind}:${id}`;
  }

  private key(terminalId: string): string {
    return `${TERMINAL_PREFIX}:${terminalId}`;
  }
}

export const terminalDirectory = new TerminalDirectory();
