import { redis } from "./redis.js";
import { realtimeBackplane } from "./realtime-backplane.js";

const TERMINAL_PREFIX = "trace:terminal:v1";
const TERMINAL_SCOPE_PREFIX = "trace:terminal-scope:v1";
const TERMINAL_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Descriptors owned by another replica are only cached briefly. The owning
 * replica changes whenever a bridge reconnects to a different replica (deploy,
 * restart, eviction), and a stale `frontendReplicaId` routes attaches into a
 * dead inbox — the frontend then sees a terminal that never reports ready.
 */
const REMOTE_DESCRIPTOR_CACHE_MS = 5_000;

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
  cols?: number;
  rows?: number;
  expiresAt: number;
};

type CachedDescriptor = TerminalDescriptor & { cachedAt: number };

export class TerminalDirectory {
  private descriptors = new Map<string, CachedDescriptor>();

  register(input: Omit<TerminalDescriptor, "frontendReplicaId" | "expiresAt">): void {
    const descriptor: TerminalDescriptor = {
      ...input,
      frontendReplicaId: realtimeBackplane.replicaId,
      expiresAt: Date.now() + TERMINAL_TTL_MS,
    };
    this.descriptors.set(input.terminalId, { ...descriptor, cachedAt: Date.now() });
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
    if (cached && cached.expiresAt > Date.now() && this.isCacheFresh(cached)) return cached;
    if (!realtimeBackplane.enabled) return undefined;
    const value = await redis.get(this.key(terminalId));
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
      this.descriptors.set(terminalId, { ...descriptor, cachedAt: Date.now() });
      return descriptor;
    } catch {
      return undefined;
    }
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
   * Live descriptors for every terminal in a session group, including the ones
   * owned by other replicas. The relay's in-process indexes only see this
   * replica's terminals, so a list built from them alone flickers between
   * replicas and invites duplicate terminals.
   */
  async listForSessionGroup(sessionGroupId: string): Promise<TerminalDescriptor[]> {
    return this.listForScope(this.scopeKey("group", sessionGroupId));
  }

  /** Live descriptors for every terminal owned by a single session. */
  async listForSession(sessionId: string): Promise<TerminalDescriptor[]> {
    return this.listForScope(this.scopeKey("session", sessionId));
  }

  private async listForScope(scopeKey: string): Promise<TerminalDescriptor[]> {
    if (!realtimeBackplane.enabled) return [];
    let terminalIds: string[];
    try {
      terminalIds = await redis.smembers(scopeKey);
    } catch (error) {
      console.error("[terminal-directory] scope read failed:", error);
      return [];
    }
    const descriptors = await Promise.all(
      terminalIds.map(async (terminalId) => {
        const descriptor = await this.get(terminalId);
        if (!descriptor) {
          void redis.srem(scopeKey, terminalId).catch(() => undefined);
          return undefined;
        }
        return descriptor;
      }),
    );
    return descriptors.filter((descriptor): descriptor is TerminalDescriptor => !!descriptor);
  }

  private scopeKeys(descriptor: TerminalDescriptor): string[] {
    const keys = [this.scopeKey("session", descriptor.sessionId)];
    if (descriptor.sessionGroupId) {
      keys.push(this.scopeKey("group", descriptor.sessionGroupId));
    }
    return keys;
  }

  private scopeKey(kind: "session" | "group", id: string): string {
    return `${TERMINAL_SCOPE_PREFIX}:${kind}:${id}`;
  }

  /** Drop the local cache entry only — the owning replica keeps the redis record. */
  invalidate(terminalId: string): void {
    const cached = this.descriptors.get(terminalId);
    if (cached && cached.frontendReplicaId !== realtimeBackplane.replicaId) {
      this.descriptors.delete(terminalId);
    }
  }

  private isCacheFresh(cached: CachedDescriptor): boolean {
    if (cached.frontendReplicaId === realtimeBackplane.replicaId) return true;
    return cached.cachedAt + REMOTE_DESCRIPTOR_CACHE_MS > Date.now();
  }

  private key(terminalId: string): string {
    return `${TERMINAL_PREFIX}:${terminalId}`;
  }
}

export const terminalDirectory = new TerminalDirectory();
