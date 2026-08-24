import { randomUUID } from "node:crypto";
import type { BridgeLinkedCheckoutStatus } from "@trace/shared";
import { redis } from "./redis.js";
import { realtimeBackplane, type BackplaneEnvelope } from "./realtime-backplane.js";

const DIRECTORY_KEY_PREFIX = "trace:runtime:v1";
const DIRECTORY_EPOCH_KEY = "trace:runtime-epoch:v1";
const PRESENCE_CHANGED = "runtime_presence_changed";
const OWNERSHIP_EPOCH_PLACEHOLDER = "__TRACE_RUNTIME_DIRECTORY_OWNERSHIP_EPOCH__";

export type RuntimeDescriptor = {
  key: string;
  id: string;
  organizationId?: string;
  ownerReplicaId: string;
  connectionGeneration: string;
  ownershipEpoch: number;
  label: string;
  hostingMode: "cloud" | "local";
  ownerUserId?: string;
  bridgeRuntimeId?: string;
  supportedTools: string[];
  protocolVersion?: number;
  registeredRepoIds: string[];
  linkedCheckoutStatuses: BridgeLinkedCheckoutStatus[];
  linkedCheckoutStatusObservedAt: Record<string, number>;
  lastHeartbeat: number;
  expiresAt: number;
};

export const RUNTIME_DIRECTORY_REGISTER_SCRIPT = `local epoch=redis.call('incr',KEYS[2]); local encoded,replacements=string.gsub(ARGV[1],'"${OWNERSHIP_EPOCH_PLACEHOLDER}"',tostring(epoch)); if replacements ~= 1 then return redis.error_reply('invalid ownership epoch placeholder') end; redis.call('set',KEYS[1],encoded,'PX',ARGV[2]); return encoded`;
const RUNTIME_DIRECTORY_REPLACE_IF_OWNER_SCRIPT =
  "local value=redis.call('get',KEYS[1]); if not value then return false end; local current=cjson.decode(value); if current.connectionGeneration ~= ARGV[1] then return false end; redis.call('set',KEYS[1],ARGV[2],'PX',ARGV[3]); return ARGV[2]";

type PresenceMessage =
  | { action: "upsert"; descriptor: RuntimeDescriptor }
  | { action: "remove"; runtimeKey: string; connectionGeneration: string };

type DescriptorUpdate = "installed" | "current" | "stale";
type RuntimeDescriptorMutation = (current: RuntimeDescriptor, now: number) => RuntimeDescriptor;

function descriptorFrom(value: unknown): RuntimeDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.key !== "string" ||
    typeof item.id !== "string" ||
    typeof item.ownerReplicaId !== "string" ||
    typeof item.connectionGeneration !== "string" ||
    typeof item.label !== "string" ||
    (item.hostingMode !== "cloud" && item.hostingMode !== "local") ||
    !Array.isArray(item.supportedTools) ||
    !Array.isArray(item.registeredRepoIds) ||
    typeof item.lastHeartbeat !== "number" ||
    typeof item.expiresAt !== "number"
  ) {
    return null;
  }
  return {
    ...item,
    ownershipEpoch: typeof item.ownershipEpoch === "number" ? item.ownershipEpoch : 0,
    linkedCheckoutStatuses: Array.isArray(item.linkedCheckoutStatuses)
      ? (item.linkedCheckoutStatuses as BridgeLinkedCheckoutStatus[])
      : [],
    linkedCheckoutStatusObservedAt:
      item.linkedCheckoutStatusObservedAt &&
      typeof item.linkedCheckoutStatusObservedAt === "object" &&
      !Array.isArray(item.linkedCheckoutStatusObservedAt)
        ? (item.linkedCheckoutStatusObservedAt as Record<string, number>)
        : {},
  } as unknown as RuntimeDescriptor;
}

function descriptorJsonWithEpochPlaceholder(descriptor: RuntimeDescriptor): string {
  return JSON.stringify({
    ...descriptor,
    ownershipEpoch: OWNERSHIP_EPOCH_PLACEHOLDER,
  });
}

export class RuntimeDirectory {
  private descriptors = new Map<string, RuntimeDescriptor>();
  private listeners = new Set<(message: PresenceMessage) => void>();
  private mutationQueues = new Map<string, Promise<void>>();
  private unsubscribe: (() => void) | null = null;

  async start(): Promise<void> {
    if (this.unsubscribe) return;
    this.unsubscribe = realtimeBackplane.on(PRESENCE_CHANGED, (envelope) => {
      this.applyPresenceEnvelope(envelope);
    });
    if (!realtimeBackplane.enabled) return;

    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${DIRECTORY_KEY_PREFIX}:*`,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length === 0) continue;
      const values = await redis.mget(...keys);
      for (const value of values) {
        if (!value) continue;
        try {
          const descriptor = descriptorFrom(JSON.parse(value));
          if (descriptor && descriptor.expiresAt > Date.now()) {
            this.descriptors.set(descriptor.key, descriptor);
          }
        } catch {
          // Ignore stale or malformed directory entries; owners will refresh.
        }
      }
    } while (cursor !== "0");
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.descriptors.clear();
  }

  onPresence(listener: (message: PresenceMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createDescriptor(
    input: Omit<
      RuntimeDescriptor,
      "ownerReplicaId" | "connectionGeneration" | "ownershipEpoch" | "lastHeartbeat" | "expiresAt"
    >,
    ttlMs: number,
  ): RuntimeDescriptor {
    const now = Date.now();
    return {
      ...input,
      ownerReplicaId: realtimeBackplane.replicaId,
      connectionGeneration: randomUUID(),
      ownershipEpoch: 0,
      lastHeartbeat: now,
      expiresAt: now + ttlMs,
    };
  }

  async register(descriptor: RuntimeDescriptor, ttlMs: number): Promise<RuntimeDescriptor> {
    return this.withMutationQueue(descriptor.key, async () => {
      if (!realtimeBackplane.enabled) return this.registerLocal(descriptor);
      const result = await redis.eval(
        RUNTIME_DIRECTORY_REGISTER_SCRIPT,
        2,
        this.redisKey(descriptor.key),
        DIRECTORY_EPOCH_KEY,
        descriptorJsonWithEpochPlaceholder(descriptor),
        String(ttlMs),
      );
      if (typeof result !== "string") throw new Error("Failed to claim runtime ownership");
      const stored = descriptorFrom(JSON.parse(result));
      if (!stored) throw new Error("Redis returned an invalid runtime ownership descriptor");
      const claimed = stored;
      const update = this.applyDescriptor(claimed);
      if (update === "stale") return claimed;
      try {
        await realtimeBackplane.broadcast(PRESENCE_CHANGED, {
          action: "upsert",
          descriptor: claimed,
        });
      } catch (error) {
        // The Redis lease is already authoritative. Keep the connection alive;
        // its next heartbeat will retry the presence broadcast.
        console.error("[runtime-directory] ownership presence broadcast failed:", error);
      }
      return claimed;
    });
  }

  /**
   * Confirm a local socket still owns Redis immediately before writing to it.
   * Pub/sub presence is only an invalidation accelerator; it is not the
   * authority because a presence publish can fail after a newer lease commits.
   */
  async isCurrentOwner(
    runtimeKey: string,
    connectionGeneration: string,
    ownerReplicaId: string,
  ): Promise<boolean> {
    const cached = this.descriptors.get(runtimeKey);
    if (!realtimeBackplane.enabled) {
      return (
        cached?.connectionGeneration === connectionGeneration &&
        cached.ownerReplicaId === ownerReplicaId
      );
    }

    try {
      const value = await redis.get(this.redisKey(runtimeKey));
      if (!value) return false;
      const descriptor = descriptorFrom(JSON.parse(value));
      if (!descriptor || descriptor.expiresAt <= Date.now()) return false;
      if (this.applyDescriptor(descriptor) === "installed") {
        this.emit({ action: "upsert", descriptor });
      }
      return (
        descriptor.connectionGeneration === connectionGeneration &&
        descriptor.ownerReplicaId === ownerReplicaId
      );
    } catch (error) {
      // Preserve the plan's local-delivery behavior during a total Redis
      // outage. Once Redis is reachable, the next write/heartbeat fences any
      // superseded socket.
      console.error("[runtime-directory] ownership validation failed:", error);
      return (
        cached?.connectionGeneration === connectionGeneration &&
        cached.ownerReplicaId === ownerReplicaId
      );
    }
  }

  registerLocal(descriptor: RuntimeDescriptor): RuntimeDescriptor {
    const currentEpoch = this.descriptors.get(descriptor.key)?.ownershipEpoch ?? 0;
    const claimed = {
      ...descriptor,
      ownershipEpoch: Math.max(descriptor.ownershipEpoch, currentEpoch + 1),
    };
    this.descriptors.set(claimed.key, claimed);
    void realtimeBackplane
      .broadcast(PRESENCE_CHANGED, { action: "upsert", descriptor: claimed })
      .catch((error) =>
        console.error("[runtime-directory] local presence broadcast failed:", error),
      );
    return claimed;
  }

  /**
   * Re-claim a lapsed directory lease for a socket this replica still holds.
   *
   * Only an owner ever writes its own key, so an absent entry means the lease
   * expired — never that a peer took over. Reclaiming preserves
   * `connectionGeneration` so session bindings established on this socket stay
   * valid. If a peer genuinely owns the key now its descriptor is live under a
   * different generation, and we return null rather than steal it.
   */
  async reclaim(descriptor: RuntimeDescriptor, ttlMs: number): Promise<RuntimeDescriptor | null> {
    if (!realtimeBackplane.enabled) return this.registerLocal(descriptor);
    const raw = await redis.get(this.redisKey(descriptor.key));
    if (raw) {
      let current: RuntimeDescriptor | null = null;
      try {
        current = descriptorFrom(JSON.parse(raw));
      } catch {
        // Malformed entry — treat as absent and reclaim below.
      }
      if (
        current &&
        current.expiresAt > Date.now() &&
        current.connectionGeneration !== descriptor.connectionGeneration
      ) {
        return null;
      }
    }
    const now = Date.now();
    return this.register({ ...descriptor, lastHeartbeat: now, expiresAt: now + ttlMs }, ttlMs);
  }

  async renew(runtimeKey: string, connectionGeneration: string, ttlMs: number): Promise<boolean> {
    return this.mutateCurrentDescriptor(
      runtimeKey,
      connectionGeneration,
      ttlMs,
      (current, now) => ({
        ...current,
        lastHeartbeat: now,
        expiresAt: now + ttlMs,
      }),
    );
  }

  async updateRegisteredRepoIds(
    runtimeKey: string,
    connectionGeneration: string,
    registeredRepoIds: string[],
    ttlMs: number,
  ): Promise<boolean> {
    return this.mutateCurrentDescriptor(
      runtimeKey,
      connectionGeneration,
      ttlMs,
      (current, now) => ({
        ...current,
        registeredRepoIds: [...registeredRepoIds],
        lastHeartbeat: now,
        expiresAt: now + ttlMs,
      }),
    );
  }

  async updateLinkedCheckoutStatus(
    runtimeKey: string,
    connectionGeneration: string,
    status: BridgeLinkedCheckoutStatus,
    ttlMs: number,
  ): Promise<boolean> {
    return this.mutateCurrentDescriptor(
      runtimeKey,
      connectionGeneration,
      ttlMs,
      (current, now) => ({
        ...current,
        linkedCheckoutStatuses: [
          ...current.linkedCheckoutStatuses.filter((item) => item.repoId !== status.repoId),
          status,
        ],
        linkedCheckoutStatusObservedAt: {
          ...current.linkedCheckoutStatusObservedAt,
          [status.repoId]: now,
        },
        lastHeartbeat: now,
        expiresAt: now + ttlMs,
      }),
    );
  }

  async remove(runtimeKey: string, connectionGeneration: string): Promise<boolean> {
    const current = this.descriptors.get(runtimeKey);
    if (current?.connectionGeneration === connectionGeneration) this.descriptors.delete(runtimeKey);
    if (realtimeBackplane.enabled) {
      const removed = await redis.eval(
        "local value=redis.call('get',KEYS[1]); if not value then return 0 end; local current=cjson.decode(value); if current.connectionGeneration ~= ARGV[1] then return 0 end; return redis.call('del',KEYS[1])",
        1,
        this.redisKey(runtimeKey),
        connectionGeneration,
      );
      if (removed !== 1) return false;
    }
    await realtimeBackplane.broadcast(PRESENCE_CHANGED, {
      action: "remove",
      runtimeKey,
      connectionGeneration,
    });
    return true;
  }

  get(runtimeKey: string): RuntimeDescriptor | undefined {
    const descriptor = this.descriptors.get(runtimeKey);
    if (!descriptor) return undefined;
    if (descriptor.expiresAt <= Date.now()) {
      this.descriptors.delete(runtimeKey);
      return undefined;
    }
    return descriptor;
  }

  find(runtimeInstanceId: string, organizationId?: string | null): RuntimeDescriptor | undefined {
    const directKey = organizationId ? `${organizationId}:${runtimeInstanceId}` : runtimeInstanceId;
    const direct = this.get(directKey);
    if (direct) return direct;
    const matches = [...this.descriptors.values()].filter(
      (descriptor) =>
        descriptor.expiresAt > Date.now() &&
        descriptor.id === runtimeInstanceId &&
        (organizationId == null || descriptor.organizationId === organizationId),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  /**
   * Read-through lookup: consult the local mirror, then fall back to Redis.
   *
   * The mirror is hydrated once at start() and thereafter only by fire-and-forget
   * presence broadcasts, so a dropped envelope leaves a replica permanently
   * blind to a peer-owned runtime with nothing to repair it. `find()` cannot fix
   * that — it is synchronous by necessity for hot paths — so any caller about to
   * make an irreversible decision (declaring a home runtime offline, moving a
   * session onto fresh infrastructure, giving up on a cross-replica relay) must
   * confirm through here first. Mirrors `terminalDirectory.get()`.
   *
   * Requires `organizationId` to derive the Redis key; without it this degrades
   * to the mirror-only lookup rather than guessing.
   */
  async lookup(
    runtimeInstanceId: string,
    organizationId?: string | null,
  ): Promise<RuntimeDescriptor | undefined> {
    const cached = this.find(runtimeInstanceId, organizationId);
    if (cached) return cached;
    if (!realtimeBackplane.enabled || !organizationId) return undefined;
    const raw = await redis.get(this.redisKey(`${organizationId}:${runtimeInstanceId}`));
    if (!raw) return undefined;
    let descriptor: RuntimeDescriptor | null;
    try {
      descriptor = descriptorFrom(JSON.parse(raw));
    } catch {
      return undefined;
    }
    if (!descriptor || descriptor.expiresAt <= Date.now()) return undefined;
    if (this.applyDescriptor(descriptor) === "installed") {
      this.emit({ action: "upsert", descriptor });
    }
    return this.find(runtimeInstanceId, organizationId);
  }

  list(filter?: { hostingMode?: string }): RuntimeDescriptor[] {
    const now = Date.now();
    return [...this.descriptors.values()].filter(
      (descriptor) =>
        descriptor.expiresAt > now &&
        (!filter?.hostingMode || descriptor.hostingMode === filter.hostingMode),
    );
  }

  private redisKey(runtimeKey: string): string {
    return `${DIRECTORY_KEY_PREFIX}:${Buffer.from(runtimeKey).toString("base64url")}`;
  }

  private async mutateCurrentDescriptor(
    runtimeKey: string,
    connectionGeneration: string,
    ttlMs: number,
    mutation: RuntimeDescriptorMutation,
  ): Promise<boolean> {
    return this.withMutationQueue(runtimeKey, async () => {
      const current = this.descriptors.get(runtimeKey);
      if (!current || current.connectionGeneration !== connectionGeneration) return false;
      let descriptor = mutation(current, Date.now());

      if (realtimeBackplane.enabled) {
        const result = await redis.eval(
          RUNTIME_DIRECTORY_REPLACE_IF_OWNER_SCRIPT,
          1,
          this.redisKey(runtimeKey),
          connectionGeneration,
          JSON.stringify(descriptor),
          String(ttlMs),
        );
        if (typeof result !== "string") return false;
        const stored = descriptorFrom(JSON.parse(result));
        if (!stored) return false;
        descriptor = stored;
      }

      const update = this.applyDescriptor(descriptor);
      if (update === "stale") return false;
      if (update === "current") return true;
      await realtimeBackplane.broadcast(PRESENCE_CHANGED, { action: "upsert", descriptor });
      return true;
    });
  }

  private async withMutationQueue<T>(runtimeKey: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueues.get(runtimeKey) ?? Promise.resolve();
    let release: () => void = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => next);
    this.mutationQueues.set(runtimeKey, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.mutationQueues.get(runtimeKey) === tail) {
        this.mutationQueues.delete(runtimeKey);
      }
    }
  }

  /**
   * Install only descriptors that are at least as new as local state. A Redis
   * operation may complete after a replacement connection has already claimed
   * a higher ownership epoch, so completion order cannot determine ownership.
   */
  private applyDescriptor(descriptor: RuntimeDescriptor): DescriptorUpdate {
    const current = this.descriptors.get(descriptor.key);
    if (!current) {
      this.descriptors.set(descriptor.key, descriptor);
      return "installed";
    }
    if (current.ownershipEpoch > descriptor.ownershipEpoch) return "stale";
    if (current.ownershipEpoch < descriptor.ownershipEpoch) {
      this.descriptors.set(descriptor.key, descriptor);
      return "installed";
    }
    if (current.connectionGeneration !== descriptor.connectionGeneration) return "stale";
    if (current.lastHeartbeat > descriptor.lastHeartbeat) return "current";
    this.descriptors.set(descriptor.key, descriptor);
    return "installed";
  }

  private applyPresenceEnvelope(envelope: BackplaneEnvelope): void {
    const payload = envelope.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const message = payload as Record<string, unknown>;
    if (message.action === "upsert") {
      const descriptor = descriptorFrom(message.descriptor);
      if (!descriptor) return;
      if (this.applyDescriptor(descriptor) === "installed") {
        this.emit({ action: "upsert", descriptor });
      }
      return;
    }
    if (
      message.action === "remove" &&
      typeof message.runtimeKey === "string" &&
      typeof message.connectionGeneration === "string"
    ) {
      const current = this.descriptors.get(message.runtimeKey);
      if (current?.connectionGeneration === message.connectionGeneration) {
        this.descriptors.delete(message.runtimeKey);
        this.emit({
          action: "remove",
          runtimeKey: message.runtimeKey,
          connectionGeneration: message.connectionGeneration,
        });
      }
    }
  }

  private emit(message: PresenceMessage): void {
    for (const listener of this.listeners) listener(message);
  }
}

export const runtimeDirectory = new RuntimeDirectory();
