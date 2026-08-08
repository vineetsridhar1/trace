import { afterEach, describe, expect, it } from "vitest";
import { realtimeBackplane } from "./realtime-backplane.js";
import { RuntimeDirectory, type RuntimeDescriptor } from "./runtime-directory.js";

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
});
