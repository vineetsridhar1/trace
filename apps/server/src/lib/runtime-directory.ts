import { randomUUID } from "node:crypto";
import { redis } from "./redis.js";
import { realtimeBackplane, type BackplaneEnvelope } from "./realtime-backplane.js";

const DIRECTORY_KEY_PREFIX = "trace:runtime:v1";
const PRESENCE_CHANGED = "runtime_presence_changed";

export type RuntimeDescriptor = {
  key: string;
  id: string;
  organizationId?: string;
  ownerReplicaId: string;
  connectionGeneration: string;
  label: string;
  hostingMode: "cloud" | "local";
  ownerUserId?: string;
  bridgeRuntimeId?: string;
  supportedTools: string[];
  protocolVersion?: number;
  registeredRepoIds: string[];
  lastHeartbeat: number;
  expiresAt: number;
};

type PresenceMessage =
  | { action: "upsert"; descriptor: RuntimeDescriptor }
  | { action: "remove"; runtimeKey: string; connectionGeneration: string };

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
  return item as unknown as RuntimeDescriptor;
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
      "ownerReplicaId" | "connectionGeneration" | "lastHeartbeat" | "expiresAt"
    >,
    ttlMs: number,
  ): RuntimeDescriptor {
    const now = Date.now();
    return {
      ...input,
      ownerReplicaId: realtimeBackplane.replicaId,
      connectionGeneration: randomUUID(),
      lastHeartbeat: now,
      expiresAt: now + ttlMs,
    };
  }

  async register(descriptor: RuntimeDescriptor, ttlMs: number): Promise<void> {
    this.descriptors.set(descriptor.key, descriptor);
    if (realtimeBackplane.enabled) {
      await redis.set(this.redisKey(descriptor.key), JSON.stringify(descriptor), "PX", ttlMs);
    }
    await realtimeBackplane.broadcast(PRESENCE_CHANGED, { action: "upsert", descriptor });
  }

  async renew(runtimeKey: string, connectionGeneration: string, ttlMs: number): Promise<boolean> {
    const current = this.descriptors.get(runtimeKey);
    if (!current || current.connectionGeneration !== connectionGeneration) return false;
    const now = Date.now();
    const descriptor = { ...current, lastHeartbeat: now, expiresAt: now + ttlMs };

    if (realtimeBackplane.enabled) {
      const result = await redis.eval(
        "local value=redis.call('get',KEYS[1]); if not value then return 0 end; local current=cjson.decode(value); if current.connectionGeneration ~= ARGV[1] then return 0 end; redis.call('set',KEYS[1],ARGV[2],'PX',ARGV[3]); return 1",
        1,
        this.redisKey(runtimeKey),
        connectionGeneration,
        JSON.stringify(descriptor),
        String(ttlMs),
      );
      if (result !== 1) return false;
    }

    this.descriptors.set(runtimeKey, descriptor);
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
    const descriptor = {
      ...current,
      registeredRepoIds: [...registeredRepoIds],
      lastHeartbeat: now,
      expiresAt: now + ttlMs,
    };
    if (realtimeBackplane.enabled) {
      const result = await redis.eval(
        "local value=redis.call('get',KEYS[1]); if not value then return 0 end; local current=cjson.decode(value); if current.connectionGeneration ~= ARGV[1] then return 0 end; redis.call('set',KEYS[1],ARGV[2],'PX',ARGV[3]); return 1",
        1,
        this.redisKey(runtimeKey),
        connectionGeneration,
        JSON.stringify(descriptor),
        String(ttlMs),
      );
      if (result !== 1) return false;
    }
    this.descriptors.set(runtimeKey, descriptor);
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

  private applyPresenceEnvelope(envelope: BackplaneEnvelope): void {
    const payload = envelope.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const message = payload as Record<string, unknown>;
    if (message.action === "upsert") {
      const descriptor = descriptorFrom(message.descriptor);
      if (!descriptor) return;
      const current = this.descriptors.get(descriptor.key);
      if (!current || current.lastHeartbeat <= descriptor.lastHeartbeat) {
        this.descriptors.set(descriptor.key, descriptor);
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
