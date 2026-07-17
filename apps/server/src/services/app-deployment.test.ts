import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { AppDeploymentService } from "./app-deployment.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventServiceMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };
const enqueue = vi.fn();
const now = new Date("2026-07-17T18:00:00.000Z");

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: "deployment-1",
    organizationId: "org-1",
    sessionGroupId: "group-1",
    repoId: "repo-1",
    sourceCheckpointId: "checkpoint-1",
    commitSha: "a".repeat(40),
    status: "queued",
    requestedByUserId: "user-1",
    callbackTokenHash: createHash("sha256").update("callback-secret").digest("hex"),
    externalJobId: null,
    imageDigest: null,
    url: null,
    errorMessage: null,
    queuedAt: now,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("AppDeploymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValue({
      id: "group-1",
      kind: "app",
      ownerUserId: "user-1",
      repoId: "repo-1",
      slug: "notes",
    });
    prismaMock.gitCheckpoint.findFirst.mockResolvedValue({
      id: "checkpoint-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      commitSha: "a".repeat(40),
      committedAt: now,
      createdAt: now,
    });
    prismaMock.appDeployment.create.mockResolvedValue(deployment());
    prismaMock.appDeployment.findFirst.mockResolvedValue(null);
    prismaMock.appDeployment.findMany.mockResolvedValue([]);
    prismaMock.appDeployment.update.mockImplementation(async ({ data }) => deployment(data));
    enqueue.mockResolvedValue({ externalJobId: "message-1" });
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.example.com");
  });

  it("queues the latest durable checkpoint without exposing the preview endpoint", async () => {
    const service = new AppDeploymentService({ enqueue });
    const result = await service.publish("group-1", "org-1", "user-1");

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpointId: "checkpoint-1",
        commitSha: "a".repeat(40),
        appSlug: "notes-group1",
      }),
    );
    expect(prismaMock.sessionEndpoint.update).not.toHaveBeenCalled();
    expect(result.externalJobId).toBe("message-1");
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "app_deployment_queued", scopeId: "group-1" }),
    );
  });

  it("requires a committed checkpoint", async () => {
    prismaMock.gitCheckpoint.findFirst.mockResolvedValueOnce(null);
    const service = new AppDeploymentService({ enqueue });

    await expect(service.publish("group-1", "org-1", "user-1")).rejects.toThrow(
      "Commit the app before publishing",
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reuses an active deployment for the same checkpoint", async () => {
    prismaMock.appDeployment.findFirst.mockResolvedValueOnce(deployment());
    const service = new AppDeploymentService({ enqueue });

    const result = await service.publish("group-1", "org-1", "user-1");

    expect(result.id).toBe("deployment-1");
    expect(prismaMock.appDeployment.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("supersedes an older in-flight deployment before publishing a new checkpoint", async () => {
    prismaMock.appDeployment.findFirst.mockResolvedValueOnce(
      deployment({ id: "deployment-old", sourceCheckpointId: "checkpoint-old" }),
    );
    prismaMock.appDeployment.findMany.mockResolvedValueOnce([
      deployment({ id: "deployment-old", sourceCheckpointId: "checkpoint-old" }),
    ]);
    const service = new AppDeploymentService({ enqueue });

    await service.publish("group-1", "org-1", "user-1");

    expect(prismaMock.appDeployment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "superseded" }) }),
    );
  });

  it("accepts authenticated monotonic build callbacks", async () => {
    prismaMock.appDeployment.findUnique.mockResolvedValueOnce(deployment());
    prismaMock.appDeployment.update.mockResolvedValueOnce(
      deployment({ status: "building", startedAt: now, externalJobId: "build-1" }),
    );
    const service = new AppDeploymentService({ enqueue });

    const result = await service.updateFromCallback("deployment-1", "callback-secret", {
      status: "building",
      externalJobId: "build-1",
    });

    expect(result.status).toBe("building");
    expect(eventServiceMock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventType: "app_deployment_updated" }),
    );
  });

  it("rejects invalid callback credentials", async () => {
    prismaMock.appDeployment.findUnique.mockResolvedValueOnce(deployment());
    const service = new AppDeploymentService({ enqueue });

    await expect(
      service.updateFromCallback("deployment-1", "wrong", { status: "building" }),
    ).rejects.toThrow("Invalid deployment callback credentials");
    expect(prismaMock.appDeployment.update).not.toHaveBeenCalled();
  });

  it("records dispatch failures on the durable deployment", async () => {
    enqueue.mockRejectedValueOnce(new Error("queue unavailable"));
    const service = new AppDeploymentService({ enqueue });

    await expect(service.publish("group-1", "org-1", "user-1")).rejects.toThrow(
      "queue unavailable",
    );
    expect(prismaMock.appDeployment.update).toHaveBeenCalledWith({
      where: { id: "deployment-1" },
      data: expect.objectContaining({ status: "failed", errorMessage: "queue unavailable" }),
    });
    expect(eventServiceMock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventType: "app_deployment_updated" }),
    );
  });
});
