import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { redis } from "./redis.js";
import { realtimeBackplane } from "./realtime-backplane.js";
import {
  RUNTIME_DIRECTORY_RECLAIM_SCRIPT,
  RUNTIME_DIRECTORY_REGISTER_SCRIPT,
  RuntimeDirectory,
  type RuntimeDescriptor,
} from "./runtime-directory.js";

/** Mirrors `RuntimeDirectory.redisKey`, which is private. */
function keyFor(runtimeKey: string): string {
  return `trace:runtime:v1:${Buffer.from(runtimeKey).toString("base64url")}`;
}

function descriptor(overrides: Partial<RuntimeDescriptor> = {}): RuntimeDescriptor {
  const now = Date.now();
  return {
    key: "org-1:runtime-1",
    id: "runtime-1",
    organizationId: "org-1",
    ownerReplicaId: "replica-1",
    connectionGeneration: "generation-1",
    ownershipEpoch: 1,
    label: "Laptop",
    hostingMode: "local",
    supportedTools: ["codex"],
    registeredRepoIds: [],
    linkedCheckoutStatuses: [],
    linkedCheckoutStatusObservedAt: {},
    lastHeartbeat: now,
    expiresAt: now + 30_000,
    ...overrides,
  };
}

describe("RuntimeDirectory descriptor ordering", () => {
  const directories: RuntimeDirectory[] = [];
  const redisIntegrationIt = process.env.TRACE_REDIS_INTEGRATION === "1" ? it : it.skip;

  afterEach(() => {
    for (const directory of directories) directory.stop();
    directories.length = 0;
  });

  it("does not regress a descriptor when an older operation completes later", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    await directory.start();

    const current = descriptor({ lastHeartbeat: Date.now() + 2_000 });
    await realtimeBackplane.broadcast("runtime_presence_changed", {
      action: "upsert",
      descriptor: current,
    });
    await realtimeBackplane.broadcast("runtime_presence_changed", {
      action: "upsert",
      descriptor: { ...current, lastHeartbeat: current.lastHeartbeat - 1_000 },
    });

    expect(directory.get(current.key)?.lastHeartbeat).toBe(current.lastHeartbeat);
  });

  it("claims through Redis Lua without re-encoding descriptors", () => {
    expect(RUNTIME_DIRECTORY_REGISTER_SCRIPT).not.toContain("cjson.encode");
    expect(RUNTIME_DIRECTORY_REGISTER_SCRIPT).not.toContain("encode_empty_table_as_object");
    expect(RUNTIME_DIRECTORY_REGISTER_SCRIPT).toContain(
      "__TRACE_RUNTIME_DIRECTORY_OWNERSHIP_EPOCH__",
    );
    expect(RUNTIME_DIRECTORY_REGISTER_SCRIPT).toContain("replacements ~= 1");
  });

  it("only reclaims an absent, expired, or same-generation lease", () => {
    expect(RUNTIME_DIRECTORY_RECLAIM_SCRIPT).toContain(
      "current.expiresAt > tonumber(ARGV[3])",
    );
    expect(RUNTIME_DIRECTORY_RECLAIM_SCRIPT).toContain(
      "current.connectionGeneration ~= ARGV[1]",
    );
    expect(RUNTIME_DIRECTORY_RECLAIM_SCRIPT).toContain("return false");
  });

  it("preserves descriptor array fields across local descriptor mutations", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    await directory.start();

    const claimed = directory.registerLocal(
      descriptor({
        supportedTools: [],
        registeredRepoIds: [],
        linkedCheckoutStatuses: [],
      }),
    );

    await directory.renew(claimed.key, claimed.connectionGeneration, 30_000);
    await directory.updateRegisteredRepoIds(claimed.key, claimed.connectionGeneration, [], 30_000);

    const current = directory.get(claimed.key);
    expect(current?.supportedTools).toEqual([]);
    expect(current?.registeredRepoIds).toEqual([]);
    expect(current?.linkedCheckoutStatuses).toEqual([]);
  });

  redisIntegrationIt(
    "preserves empty descriptor arrays when Redis evaluates the registration script",
    async () => {
      const id = randomUUID();
      const descriptorKey = `trace:test-runtime-directory:${id}:descriptor`;
      const epochKey = `trace:test-runtime-directory:${id}:epoch`;
      try {
        const result = await redis.eval(
          RUNTIME_DIRECTORY_REGISTER_SCRIPT,
          2,
          descriptorKey,
          epochKey,
          JSON.stringify({
            key: "org-1:runtime-1",
            id: "runtime-1",
            ownerReplicaId: "replica-1",
            connectionGeneration: "generation-1",
            ownershipEpoch: "__TRACE_RUNTIME_DIRECTORY_OWNERSHIP_EPOCH__",
            label: "Cloud runtime",
            hostingMode: "cloud",
            supportedTools: [],
            registeredRepoIds: [],
            linkedCheckoutStatuses: [],
            linkedCheckoutStatusObservedAt: {},
            lastHeartbeat: 1,
            expiresAt: 2,
          }),
          "45000",
        );

        expect(typeof result).toBe("string");
        const stored = JSON.parse(result as string) as RuntimeDescriptor;
        expect(stored.ownershipEpoch).toBe(1);
        expect(stored.supportedTools).toEqual([]);
        expect(stored.registeredRepoIds).toEqual([]);
        expect(stored.linkedCheckoutStatuses).toEqual([]);
      } finally {
        await redis.del(descriptorKey, epochKey);
      }
    },
  );

  redisIntegrationIt("does not overwrite a live peer lease while reclaiming", async () => {
    const id = randomUUID();
    const descriptorKey = `trace:test-runtime-directory:${id}:descriptor`;
    const epochKey = `trace:test-runtime-directory:${id}:epoch`;
    const now = Date.now();
    const peer = descriptor({
      key: `org-1:${id}`,
      connectionGeneration: "peer-generation",
      expiresAt: now + 120_000,
    });
    const stale = { ...peer, connectionGeneration: "stale-generation" };
    try {
      await redis.set(descriptorKey, JSON.stringify(peer), "PX", "120000");

      const result = await redis.eval(
        RUNTIME_DIRECTORY_RECLAIM_SCRIPT,
        2,
        descriptorKey,
        epochKey,
        stale.connectionGeneration,
        JSON.stringify({
          ...stale,
          ownershipEpoch: "__TRACE_RUNTIME_DIRECTORY_OWNERSHIP_EPOCH__",
          lastHeartbeat: now,
          expiresAt: now + 30_000,
        }),
        String(now),
        "30000",
      );

      expect(result).toBeNull();
      expect(JSON.parse((await redis.get(descriptorKey)) ?? "{}")).toMatchObject(peer);
      expect(await redis.get(epochKey)).toBeNull();
    } finally {
      await redis.del(descriptorKey, epochKey);
    }
  });
});

describe("RuntimeDirectory read-through lookup", () => {
  const directories: RuntimeDirectory[] = [];
  let restoreEnabled: (() => void) | null = null;

  function forceBackplaneEnabled() {
    const original = Object.getOwnPropertyDescriptor(realtimeBackplane, "enabled");
    Object.defineProperty(realtimeBackplane, "enabled", { value: true, configurable: true });
    restoreEnabled = () => {
      if (original) Object.defineProperty(realtimeBackplane, "enabled", original);
    };
  }

  afterEach(() => {
    for (const directory of directories) directory.stop();
    directories.length = 0;
    restoreEnabled?.();
    restoreEnabled = null;
    vi.restoreAllMocks();
  });

  it("recovers a peer-owned descriptor the mirror never received", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    const peer = descriptor({
      key: "org-1:runtime-readthrough",
      id: "runtime-readthrough",
      ownerReplicaId: "peer-replica",
      expiresAt: Date.now() + 120_000,
    });
    forceBackplaneEnabled();
    // The presence broadcast never arrived, so the mirror is blind to it.
    expect(directory.find("runtime-readthrough", "org-1")).toBeUndefined();
    const get = vi.spyOn(redis, "get").mockResolvedValue(JSON.stringify(peer));

    await expect(directory.lookup("runtime-readthrough", "org-1")).resolves.toMatchObject({
      id: "runtime-readthrough",
      ownerReplicaId: "peer-replica",
    });
    expect(get).toHaveBeenCalledTimes(1);
    // Installed into the mirror, so later sync lookups no longer miss.
    expect(directory.find("runtime-readthrough", "org-1")).toMatchObject({
      ownerReplicaId: "peer-replica",
    });
  });

  it("ignores an expired entry found in Redis", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    forceBackplaneEnabled();
    vi.spyOn(redis, "get").mockResolvedValue(
      JSON.stringify(
        descriptor({
          key: "org-1:runtime-expired",
          id: "runtime-expired",
          expiresAt: Date.now() - 1,
        }),
      ),
    );

    await expect(directory.lookup("runtime-expired", "org-1")).resolves.toBeUndefined();
  });

  it("does not hit Redis when the mirror already has the descriptor", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    // start() while the backplane is still disabled: subscribes to presence
    // without the Redis hydration scan.
    await directory.start();
    const local = descriptor({ key: "org-1:runtime-cached", id: "runtime-cached" });
    await realtimeBackplane.broadcast("runtime_presence_changed", {
      action: "upsert",
      descriptor: local,
    });
    forceBackplaneEnabled();
    const get = vi.spyOn(redis, "get");

    await expect(directory.lookup("runtime-cached", "org-1")).resolves.toMatchObject({
      id: "runtime-cached",
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("degrades to the mirror when no organization scopes the key", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    forceBackplaneEnabled();
    const get = vi.spyOn(redis, "get");

    // Without an organizationId the Redis key cannot be derived; guessing would
    // risk answering with another tenant's runtime.
    await expect(directory.lookup("runtime-unscoped")).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("recovers a cloud runtime, whose descriptor key is not organization-scoped", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    // `registerRuntime` passes no `key` for cloud bridges, so the descriptor is
    // stored under the bare instance id while local bridges use `org:id`.
    const peer = descriptor({
      key: "runtime-cloud",
      id: "runtime-cloud",
      hostingMode: "cloud",
      ownerReplicaId: "peer-replica",
      expiresAt: Date.now() + 120_000,
    });
    forceBackplaneEnabled();
    const stored = new Map([[keyFor("runtime-cloud"), JSON.stringify(peer)]]);
    vi.spyOn(redis, "get").mockImplementation(async (key: string) => stored.get(key) ?? null);

    await expect(directory.lookup("runtime-cloud", "org-1")).resolves.toMatchObject({
      id: "runtime-cloud",
      ownerReplicaId: "peer-replica",
    });
  });

  it("refuses a bare-key descriptor belonging to another organization", async () => {
    const directory = new RuntimeDirectory();
    directories.push(directory);
    const foreign = descriptor({
      key: "runtime-foreign",
      id: "runtime-foreign",
      hostingMode: "cloud",
      organizationId: "org-2",
      expiresAt: Date.now() + 120_000,
    });
    forceBackplaneEnabled();
    const stored = new Map([[keyFor("runtime-foreign"), JSON.stringify(foreign)]]);
    vi.spyOn(redis, "get").mockImplementation(async (key: string) => stored.get(key) ?? null);

    // The bare-id namespace is cross-tenant, so it must be checked before use.
    await expect(directory.lookup("runtime-foreign", "org-1")).resolves.toBeUndefined();
  });
});
