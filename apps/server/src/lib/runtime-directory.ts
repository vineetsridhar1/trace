import { redis } from "./redis.js";
import { shouldUseRedisServices } from "./mode.js";
import { serverInstanceId } from "./server-instance.js";

export type RuntimeDirectoryEntry = {
  ownerInstanceId: string;
  ownerConnectionId: string;
  runtimeId: string;
  runtimeKey: string;
  label: string;
  hostingMode: "cloud" | "local";
  organizationId: string;
  ownerUserId?: string;
  bridgeRuntimeId?: string;
  supportedTools: string[];
  registeredRepoIds: string[];
  lastHeartbeatAt: string;
};

type RuntimeDirectoryUpsertInput = Omit<
  RuntimeDirectoryEntry,
  "ownerInstanceId" | "lastHeartbeatAt"
> & {
  ownerInstanceId?: string;
  lastHeartbeatAt?: string;
};

const RUNTIME_TTL_SECONDS = Number(process.env.TRACE_RUNTIME_DIRECTORY_TTL_SECONDS ?? 75);

function runtimeKey(organizationId: string, runtimeId: string): string {
  return `trace:runtime:${organizationId}:${runtimeId}`;
}

function encode(entry: RuntimeDirectoryEntry): Record<string, string> {
  return {
    ownerInstanceId: entry.ownerInstanceId,
    ownerConnectionId: entry.ownerConnectionId,
    runtimeId: entry.runtimeId,
    runtimeKey: entry.runtimeKey,
    label: entry.label,
    hostingMode: entry.hostingMode,
    organizationId: entry.organizationId,
    ownerUserId: entry.ownerUserId ?? "",
    bridgeRuntimeId: entry.bridgeRuntimeId ?? "",
    supportedTools: JSON.stringify(entry.supportedTools),
    registeredRepoIds: JSON.stringify(entry.registeredRepoIds),
    lastHeartbeatAt: entry.lastHeartbeatAt,
  };
}

function stringArrayJson(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function decode(raw: Record<string, string>): RuntimeDirectoryEntry | null {
  if (
    !raw.ownerInstanceId ||
    !raw.ownerConnectionId ||
    !raw.runtimeId ||
    !raw.runtimeKey ||
    !raw.label ||
    (raw.hostingMode !== "cloud" && raw.hostingMode !== "local") ||
    !raw.organizationId ||
    !raw.lastHeartbeatAt
  ) {
    return null;
  }
  return {
    ownerInstanceId: raw.ownerInstanceId,
    ownerConnectionId: raw.ownerConnectionId,
    runtimeId: raw.runtimeId,
    runtimeKey: raw.runtimeKey,
    label: raw.label,
    hostingMode: raw.hostingMode,
    organizationId: raw.organizationId,
    ownerUserId: raw.ownerUserId || undefined,
    bridgeRuntimeId: raw.bridgeRuntimeId || undefined,
    supportedTools: stringArrayJson(raw.supportedTools),
    registeredRepoIds: stringArrayJson(raw.registeredRepoIds),
    lastHeartbeatAt: raw.lastHeartbeatAt,
  };
}

interface RuntimeDirectory {
  upsert(input: RuntimeDirectoryUpsertInput): Promise<RuntimeDirectoryEntry>;
  refresh(
    organizationId: string,
    runtimeId: string,
    ownerConnectionId: string,
    patch?: Partial<
      Pick<RuntimeDirectoryEntry, "supportedTools" | "registeredRepoIds" | "label">
    >,
  ): Promise<boolean>;
  removeIfOwner(
    organizationId: string,
    runtimeId: string,
    ownerConnectionId: string,
  ): Promise<boolean>;
  get(organizationId: string, runtimeId: string): Promise<RuntimeDirectoryEntry | null>;
  list(organizationId?: string): Promise<RuntimeDirectoryEntry[]>;
  getCached(organizationId: string, runtimeId: string): RuntimeDirectoryEntry | null;
  listCached(organizationId?: string): RuntimeDirectoryEntry[];
}

export class MemoryRuntimeDirectory implements RuntimeDirectory {
  protected entries = new Map<string, RuntimeDirectoryEntry>();

  async upsert(input: RuntimeDirectoryUpsertInput): Promise<RuntimeDirectoryEntry> {
    const entry: RuntimeDirectoryEntry = {
      ...input,
      ownerInstanceId: input.ownerInstanceId ?? serverInstanceId,
      lastHeartbeatAt: input.lastHeartbeatAt ?? new Date().toISOString(),
    };
    this.entries.set(runtimeKey(entry.organizationId, entry.runtimeId), entry);
    return entry;
  }

  async refresh(
    organizationId: string,
    runtimeId: string,
    ownerConnectionId: string,
    patch: Partial<Pick<RuntimeDirectoryEntry, "supportedTools" | "registeredRepoIds" | "label">> = {},
  ): Promise<boolean> {
    const key = runtimeKey(organizationId, runtimeId);
    const entry = this.entries.get(key);
    if (!entry || entry.ownerConnectionId !== ownerConnectionId) return false;
    this.entries.set(key, { ...entry, ...patch, lastHeartbeatAt: new Date().toISOString() });
    return true;
  }

  async removeIfOwner(
    organizationId: string,
    runtimeId: string,
    ownerConnectionId: string,
  ): Promise<boolean> {
    const key = runtimeKey(organizationId, runtimeId);
    const entry = this.entries.get(key);
    if (!entry || entry.ownerConnectionId !== ownerConnectionId) return false;
    this.entries.delete(key);
    return true;
  }

  async get(organizationId: string, runtimeId: string): Promise<RuntimeDirectoryEntry | null> {
    return this.getCached(organizationId, runtimeId);
  }

  async list(organizationId?: string): Promise<RuntimeDirectoryEntry[]> {
    return this.listCached(organizationId);
  }

  getCached(organizationId: string, runtimeId: string): RuntimeDirectoryEntry | null {
    return this.entries.get(runtimeKey(organizationId, runtimeId)) ?? null;
  }

  listCached(organizationId?: string): RuntimeDirectoryEntry[] {
    const entries = [...this.entries.values()];
    return organizationId
      ? entries.filter((entry) => entry.organizationId === organizationId)
      : entries;
  }
}

export class RedisRuntimeDirectory extends MemoryRuntimeDirectory {
  override async upsert(input: RuntimeDirectoryUpsertInput): Promise<RuntimeDirectoryEntry> {
    const entry = await super.upsert(input);
    const key = runtimeKey(entry.organizationId, entry.runtimeId);
    await redis.hset(key, encode(entry));
    await redis.expire(key, RUNTIME_TTL_SECONDS);
    return entry;
  }

  override async refresh(
    organizationId: string,
    runtimeId: string,
    ownerConnectionId: string,
    patch: Partial<Pick<RuntimeDirectoryEntry, "supportedTools" | "registeredRepoIds" | "label">> = {},
  ): Promise<boolean> {
    const entry = await this.get(organizationId, runtimeId);
    if (!entry || entry.ownerConnectionId !== ownerConnectionId) return false;
    const next: RuntimeDirectoryEntry = {
      ...entry,
      ...patch,
      lastHeartbeatAt: new Date().toISOString(),
    };
    await super.upsert(next);
    const key = runtimeKey(organizationId, runtimeId);
    await redis.hset(key, encode(next));
    await redis.expire(key, RUNTIME_TTL_SECONDS);
    return true;
  }

  override async removeIfOwner(
    organizationId: string,
    runtimeId: string,
    ownerConnectionId: string,
  ): Promise<boolean> {
    const entry = await this.get(organizationId, runtimeId);
    if (!entry || entry.ownerConnectionId !== ownerConnectionId) return false;
    await redis.del(runtimeKey(organizationId, runtimeId));
    await super.removeIfOwner(organizationId, runtimeId, ownerConnectionId);
    return true;
  }

  override async get(organizationId: string, runtimeId: string): Promise<RuntimeDirectoryEntry | null> {
    const raw = await redis.hgetall(runtimeKey(organizationId, runtimeId));
    const entry = decode(raw);
    if (entry) await super.upsert(entry);
    return entry;
  }

  override async list(organizationId?: string): Promise<RuntimeDirectoryEntry[]> {
    const pattern = organizationId ? `trace:runtime:${organizationId}:*` : "trace:runtime:*:*";
    let cursor = "0";
    const entries: RuntimeDirectoryEntry[] = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      for (const key of keys) {
        const entry = decode(await redis.hgetall(key));
        if (!entry) continue;
        await super.upsert(entry);
        entries.push(entry);
      }
    } while (cursor !== "0");
    return entries;
  }
}

function useRedisRuntimeDirectory(): boolean {
  const mode = process.env.TRACE_RUNTIME_DIRECTORY?.trim().toLowerCase();
  if (mode === "memory") return false;
  if (mode === "redis") return true;
  return shouldUseRedisServices();
}

export const runtimeDirectory: RuntimeDirectory = useRedisRuntimeDirectory()
  ? new RedisRuntimeDirectory()
  : new MemoryRuntimeDirectory();
