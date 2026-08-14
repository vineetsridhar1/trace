import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { redis } from "./redis.js";
import { realtimeBackplane } from "./realtime-backplane.js";
import {
  RUNTIME_DIRECTORY_REGISTER_SCRIPT,
  RuntimeDirectory,
  type RuntimeDescriptor,
} from "./runtime-directory.js";

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
});
