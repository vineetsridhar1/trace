import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    listRuntimes: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { connectionsService } from "./connections.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  listRuntimes: ReturnType<typeof vi.fn>;
};

describe("connectionsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns connected bridge repos visible through user member channels", async () => {
    const connectedAt = new Date("2026-04-22T12:00:00.000Z");
    prismaMock.bridgeRuntime.findMany.mockResolvedValueOnce([
      {
        id: "bridge-1",
        instanceId: "runtime-1",
        organizationId: "org-1",
        ownerUserId: "user-1",
        label: "Laptop",
        hostingMode: "local",
        connectedAt,
        disconnectedAt: null,
        lastSeenAt: connectedAt,
        metadata: null,
        createdAt: connectedAt,
        updatedAt: connectedAt,
        ownerUser: { id: "user-1", name: "User One" },
        accessRequests: [],
        accessGrants: [],
      },
      {
        id: "bridge-2",
        instanceId: "runtime-2",
        organizationId: "org-1",
        ownerUserId: "user-1",
        label: "Offline Laptop",
        hostingMode: "local",
        connectedAt: null,
        disconnectedAt: connectedAt,
        lastSeenAt: connectedAt,
        metadata: null,
        createdAt: connectedAt,
        updatedAt: connectedAt,
        ownerUser: { id: "user-1", name: "User One" },
        accessRequests: [],
        accessGrants: [],
      },
    ]);

    sessionRouterMock.listRuntimes.mockReturnValueOnce([
      {
        id: "runtime-1",
        organizationId: "org-1",
        registeredRepoIds: ["repo-1", "repo-hidden"],
        linkedCheckouts: new Map([
          [
            "repo-1",
            {
              repoId: "repo-1",
              repoPath: "/repos/gorilla",
              isAttached: true,
              attachedSessionGroupId: "group-1",
              targetBranch: "main",
              autoSyncEnabled: true,
              currentBranch: "main",
              currentCommitSha: "abcdef123",
              lastSyncedCommitSha: "abcdef123",
              lastSyncError: null,
              restoreBranch: null,
              restoreCommitSha: null,
            },
          ],
        ]),
      },
    ]);

    prismaMock.channel.findMany.mockResolvedValueOnce([
      {
        id: "channel-1",
        name: "Gorilla",
        type: "coding",
        organizationId: "org-1",
        repoId: "repo-1",
        runScripts: [{ name: "Dev", command: "pnpm dev" }],
        createdAt: connectedAt,
        updatedAt: connectedAt,
        repo: { id: "repo-1", name: "gorilla", defaultBranch: "main" },
      },
    ]);

    const result = await connectionsService.listMine({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(result).toHaveLength(2);
    expect(result[0].bridge.id).toBe("bridge-1");
    expect(result[0].repos).toHaveLength(1);
    expect(result[0].repos[0]).toEqual(
      expect.objectContaining({
        repo: expect.objectContaining({ id: "repo-1" }),
        channel: expect.objectContaining({ id: "channel-1" }),
        runScripts: [{ name: "Dev", command: "pnpm dev" }],
        linkedCheckout: expect.objectContaining({ attachedSessionGroupId: "group-1" }),
      }),
    );
    expect(result[1].bridge.id).toBe("bridge-2");
    expect(result[1].repos).toEqual([]);
    expect(prismaMock.bridgeRuntime.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          ownerUserId: "user-1",
        }),
      }),
    );
    expect(prismaMock.bridgeRuntime.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty("OR");
    expect(prismaMock.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          repoId: { in: ["repo-1", "repo-hidden"] },
          members: { some: { userId: "user-1" } },
        }),
      }),
    );
  });

  it("does not query bridges only granted to the user", async () => {
    prismaMock.bridgeRuntime.findMany.mockResolvedValueOnce([]);
    sessionRouterMock.listRuntimes.mockReturnValueOnce([]);

    await connectionsService.listMine({
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(prismaMock.bridgeRuntime.findMany.mock.calls[0]?.[0]?.where).toEqual(
      expect.objectContaining({
        organizationId: "org-1",
        ownerUserId: "user-1",
      }),
    );
    expect(prismaMock.bridgeRuntime.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty(
      "accessGrants",
    );
    expect(prismaMock.bridgeRuntime.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty("OR");
  });
});
