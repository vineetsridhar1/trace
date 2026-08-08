import { randomUUID } from "node:crypto";
import type { BridgeLinkedCheckoutStatus } from "@trace/shared";
import { redis } from "./redis.js";
import { realtimeBackplane, type BackplaneEnvelope } from "./realtime-backplane.js";

const DIRECTORY_KEY_PREFIX = "trace:runtime:v1";
const DIRECTORY_EPOCH_KEY = "trace:runtime-epoch:v1";
const PRESENCE_CHANGED = "runtime_presence_changed";

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

type PresenceMessage =
  | { action: "upsert"; descriptor: RuntimeDescriptor }
  | { action: "remove"; runtimeKey: string; connectionGeneration: string };

type DescriptorUpdate = "installed" | "current" | "stale";

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

export class RuntimeDirectory {
  private descriptors = new Map<string, RuntimeDescriptor>();
  private listeners = new Set<(message: PresenceMessage) => void>();
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
    if (!realtimeBackplane.enabled) return this.registerLocal(descriptor);
    const result = await redis.eval(
      "local epoch=redis.call('incr',KEYS[2]); local descriptor=cjson.decode(ARGV[1]); descriptor.ownershipEpoch=epoch; local encoded=cjson.encode(descriptor); redis.call('set',KEYS[1],encoded,'PX',ARGV[2]); return encoded",
      2,
      this.redisKey(descriptor.key),
      DIRECTORY_EPOCH_KEY,
      JSON.stringify(descriptor),
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

  async renew(runtimeKey: string, connectionGeneration: string, ttlMs: number): Promise<boolean> {
    const current = this.descriptors.get(runtimeKey);
    if (!current || current.connectionGeneration !== connectionGeneration) return false;
    const now = Date.now();
    let descriptor = { ...current, lastHeartbeat: now, expiresAt: now + ttlMs };

    if (realtimeBackplane.enabled) {
      const result = await redis.eval(
        "local value=redis.call('get',KEYS[1]); if not value then return false end; local current=cjson.decode(value); if current.connectionGeneration ~= ARGV[1] then return false end; current.lastHeartbeat=math.max(tonumber(ARGV[2]),(tonumber(current.lastHeartbeat) or 0)+1); current.expiresAt=tonumber(ARGV[3]); local encoded=cjson.encode(current); redis.call('set',KEYS[1],encoded,'PX',ARGV[4]); return encoded",
        1,
        this.redisKey(runtimeKey),
        connectionGeneration,
        String(now),
        String(now + ttlMs),
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
  }

  async updateRegisteredRepoIds(
    runtimeKey: string,
    connectionGeneration: string,
    registeredRepoIds: string[],
    ttlMs: number,
  ): Promise<boolean> {
    const current = this.descriptors.get(runtimeKey);
    if (!current || current.connectionGeneration !== connectionGeneration) return false;
    const now = Date.now();
    let descriptor = {
      ...current,
      registeredRepoIds: [...registeredRepoIds],
      lastHeartbeat: now,
      expiresAt: now + ttlMs,
    };
    if (realtimeBackplane.enabled) {
      const result = await redis.eval(
        "local value=redis.call('get',KEYS[1]); if not value then return false end; local current=cjson.decode(value); if current.connectionGeneration ~= ARGV[1] then return false end; current.registeredRepoIds=cjson.decode(ARGV[2]); current.lastHeartbeat=math.max(tonumber(ARGV[3]),(tonumber(current.lastHeartbeat) or 0)+1); current.expiresAt=tonumber(ARGV[4]); local encoded=cjson.encode(current); redis.call('set',KEYS[1],encoded,'PX',ARGV[5]); return encoded",
        1,
        this.redisKey(runtimeKey),
        connectionGeneration,
        JSON.stringify(registeredRepoIds),
        String(now),
        String(now + ttlMs),
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
  }

  async updateLinkedCheckoutStatus(
    runtimeKey: string,
    connectionGeneration: string,
    status: BridgeLinkedCheckoutStatus,
    ttlMs: number,
  ): Promise<boolean> {
    const current = this.descriptors.get(runtimeKey);
    if (!current || current.connectionGeneration !== connectionGeneration) return false;
    const now = Date.now();
    let descriptor = {
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
    };
    if (realtimeBackplane.enabled) {
      const result = await redis.eval(
        "local value=redis.call('get',KEYS[1]); if not value then return false end; local current=cjson.decode(value); if current.connectionGeneration ~= ARGV[1] then return false end; local status=cjson.decode(ARGV[2]); local statuses=current.linkedCheckoutStatuses or {}; local updated={}; for i=1,#statuses do if statuses[i].repoId ~= status.repoId then table.insert(updated,statuses[i]) end end; table.insert(updated,status); current.linkedCheckoutStatuses=updated; current.linkedCheckoutStatusObservedAt=current.linkedCheckoutStatusObservedAt or {}; current.linkedCheckoutStatusObservedAt[status.repoId]=tonumber(ARGV[3]); current.lastHeartbeat=math.max(tonumber(ARGV[3]),(tonumber(current.lastHeartbeat) or 0)+1); current.expiresAt=tonumber(ARGV[4]); local encoded=cjson.encode(current); redis.call('set',KEYS[1],encoded,'PX',ARGV[5]); return encoded",
        1,
        this.redisKey(runtimeKey),
        connectionGeneration,
        JSON.stringify(status),
        String(now),
        String(now + ttlMs),
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
