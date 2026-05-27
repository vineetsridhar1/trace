import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./redis.js", async () => {
  const { createRedisMock } = await import("../../test/helpers.js");
  return { redis: createRedisMock() };
});

import { redis } from "./redis.js";
import { MemoryRuntimeDirectory, RedisRuntimeDirectory } from "./runtime-directory.js";

const redisMock = redis as ReturnType<typeof import("../../test/helpers.js")["createRedisMock"]>;

function entry(overrides: Partial<Parameters<MemoryRuntimeDirectory["upsert"]>[0]> = {}) {
  return {
    ownerConnectionId: "connection-1",
    runtimeId: "runtime-1",
    runtimeKey: "org-1:runtime-1",
    label: "Laptop",
    hostingMode: "local" as const,
    organizationId: "org-1",
    ownerUserId: "user-1",
    bridgeRuntimeId: "bridge-1",
    supportedTools: ["codex"],
    registeredRepoIds: ["repo-1"],
    ...overrides,
  };
}

describe("runtime directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.hset.mockResolvedValue(1);
    redisMock.expire.mockResolvedValue(1);
    redisMock.del.mockResolvedValue(1);
    redisMock.scan.mockResolvedValue(["0", []]);
    redisMock.hgetall.mockResolvedValue({});
  });

  it("tracks memory presence and ignores stale owner removal", async () => {
    const directory = new MemoryRuntimeDirectory();
    await directory.upsert(entry());

    await expect(directory.get("org-1", "runtime-1")).resolves.toMatchObject({
      runtimeId: "runtime-1",
      registeredRepoIds: ["repo-1"],
    });
    await expect(directory.removeIfOwner("org-1", "runtime-1", "old-connection")).resolves.toBe(
      false,
    );
    await expect(directory.get("org-1", "runtime-1")).resolves.not.toBeNull();
    await expect(directory.removeIfOwner("org-1", "runtime-1", "connection-1")).resolves.toBe(
      true,
    );
    await expect(directory.get("org-1", "runtime-1")).resolves.toBeNull();
  });

  it("serializes Redis presence and refreshes TTL", async () => {
    const directory = new RedisRuntimeDirectory();
    await directory.upsert(entry());

    expect(redisMock.hset).toHaveBeenCalledWith(
      "trace:runtime:org-1:runtime-1",
      expect.objectContaining({
        ownerConnectionId: "connection-1",
        runtimeId: "runtime-1",
        supportedTools: JSON.stringify(["codex"]),
      }),
    );
    expect(redisMock.expire).toHaveBeenCalledWith("trace:runtime:org-1:runtime-1", 75);
  });

  it("does not remove a Redis runtime owned by a newer connection", async () => {
    redisMock.hgetall.mockResolvedValue({
      ownerInstanceId: "server-1",
      ownerConnectionId: "connection-2",
      runtimeId: "runtime-1",
      runtimeKey: "org-1:runtime-1",
      label: "Laptop",
      hostingMode: "local",
      organizationId: "org-1",
      ownerUserId: "user-1",
      bridgeRuntimeId: "bridge-1",
      supportedTools: JSON.stringify(["codex"]),
      registeredRepoIds: JSON.stringify(["repo-1"]),
      lastHeartbeatAt: new Date().toISOString(),
    });
    const directory = new RedisRuntimeDirectory();

    await expect(directory.removeIfOwner("org-1", "runtime-1", "connection-1")).resolves.toBe(
      false,
    );
    expect(redisMock.del).not.toHaveBeenCalled();
  });
});
