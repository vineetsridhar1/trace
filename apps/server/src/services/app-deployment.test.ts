import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn(), publishCreated: vi.fn() },
}));

vi.mock("../lib/encryption.js", () => ({
  encryptSecret: vi.fn(() => ({ encrypted: "encrypted-callback", iv: "callback-iv" })),
  decryptSecret: vi.fn(() => "callback-secret"),
}));

const gitStorageMock = vi.hoisted(() => ({ listRefs: vi.fn() }));
vi.mock("../lib/git-storage/index.js", () => ({ gitStorage: gitStorageMock }));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { AppDeploymentService, normalizeDeploymentSpec } from "./app-deployment.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventServiceMock = eventService as unknown as {
  create: ReturnType<typeof vi.fn>;
  publishCreated: ReturnType<typeof vi.fn>;
};
const enqueue = vi.fn();
const now = new Date("2026-07-17T18:00:00.000Z");

const serviceInput = {
  sessionGroupId: "group-1",
  target: "service",
  buildCommand: "pnpm build",
  startCommand: "pnpm start",
  port: 3000,
  healthPath: "/",
  database: false,
} as const;

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: "deployment-1",
    organizationId: "org-1",
    sessionGroupId: "group-1",
    repoId: "repo-1",
    commitSha: "a".repeat(40),
    status: "queued",
    target: "service",
    spec: {
      target: "service",
      buildCommand: "pnpm build",
      startCommand: "pnpm start",
      port: 3000,
      healthPath: "/",
      database: false,
    },
    appSlug: "notes-group1",
    requestedByUserId: "user-1",
    callbackTokenHash: createHash("sha256").update("callback-secret").digest("hex"),
    callbackTokenEncrypted: "encrypted-callback",
    callbackTokenIv: "callback-iv",
    clientMutationId: null,
    dispatchAttempts: 0,
    nextDispatchAt: new Date(0),
    dispatchedAt: null,
    externalJobId: null,
    imageDigest: null,
    staticPrefix: null,
    serviceName: null,
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
      branch: "main",
    });
    gitStorageMock.listRefs.mockResolvedValue(new Map([["refs/heads/main", "a".repeat(40)]]));
    prismaMock.appDeployment.create.mockResolvedValue(deployment());
    prismaMock.appDeployment.findFirst.mockResolvedValue(null);
    prismaMock.appDeployment.findMany.mockResolvedValue([]);
    prismaMock.appDeployment.findUnique.mockResolvedValue(deployment());
    prismaMock.appDeployment.findUniqueOrThrow.mockResolvedValue(
      deployment({ externalJobId: "message-1", dispatchedAt: now }),
    );
    prismaMock.appDeployment.update.mockImplementation(async ({ data }) => deployment(data));
    eventServiceMock.create.mockResolvedValue({ id: "event-1" });
    enqueue.mockResolvedValue({ externalJobId: "message-1" });
    vi.stubEnv("TRACE_SERVER_PUBLIC_URL", "https://trace.example.com");
    vi.stubEnv("TRACE_PUBLISHED_APP_BASE_HOST", "apps.trace.example.com");
    vi.stubEnv("TRACE_APP_DATA_ENABLED", "true");
  });

  it("queues the latest pushed app commit without exposing the preview endpoint", async () => {
    const service = new AppDeploymentService({ enqueue });
    const result = await service.deploy(serviceInput, "org-1", "user-1");

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        commitSha: "a".repeat(40),
        appSlug: "notes-group1",
      }),
    );
    expect(prismaMock.sessionEndpoint.update).not.toHaveBeenCalled();
    expect(result.externalJobId).toBe("message-1");
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "app_deployment_queued",
        scopeId: "group-1",
        deferPublish: true,
      }),
      expect.anything(),
    );
    expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "event-1" });
  });

  it("keeps deployment decisions explicit and validates target-specific facts", () => {
    expect(
      normalizeDeploymentSpec({
        sessionGroupId: "group-1",
        target: "static",
        buildCommand: "pnpm build",
        outputDirectory: "dist",
      }),
    ).toEqual({ target: "static", buildCommand: "pnpm build", outputDirectory: "dist" });
    expect(() =>
      normalizeDeploymentSpec({
        sessionGroupId: "group-1",
        target: "static",
        outputDirectory: "../dist",
      }),
    ).toThrow("relative directory");
    expect(() =>
      normalizeDeploymentSpec({
        sessionGroupId: "group-1",
        target: "service",
        startCommand: "pnpm start",
        migrationCommand: "pnpm db:migrate",
      }),
    ).toThrow("requires database access");
  });

  it("requires a pushed app branch", async () => {
    gitStorageMock.listRefs.mockResolvedValueOnce(new Map());
    const service = new AppDeploymentService({ enqueue });

    await expect(service.deploy(serviceInput, "org-1", "user-1")).rejects.toThrow(
      "Push the app branch before publishing",
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects database deployments before enqueue when app data is disabled", async () => {
    vi.stubEnv("TRACE_APP_DATA_ENABLED", "false");
    const service = new AppDeploymentService({ enqueue });

    await expect(
      service.deploy({ ...serviceInput, database: true }, "org-1", "user-1"),
    ).rejects.toThrow("Persistent PostgreSQL is not enabled");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reuses an active deployment for the same commit", async () => {
    prismaMock.appDeployment.findFirst.mockResolvedValueOnce(deployment());
    const service = new AppDeploymentService({ enqueue });

    const result = await service.deploy(serviceInput, "org-1", "user-1");

    expect(result.id).toBe("deployment-1");
    expect(prismaMock.appDeployment.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("refuses to race an older in-flight deployment", async () => {
    prismaMock.appDeployment.findFirst.mockResolvedValueOnce(
      deployment({ id: "deployment-old", commitSha: "b".repeat(40) }),
    );
    const service = new AppDeploymentService({ enqueue });

    await expect(service.deploy(serviceInput, "org-1", "user-1")).rejects.toThrow(
      "already has a deployment in progress",
    );
    expect(enqueue).not.toHaveBeenCalled();
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

    expect(result.accepted).toBe(true);
    expect(result.deployment.status).toBe("building");
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

  it("prevents a build callback from routing to another app", async () => {
    prismaMock.appDeployment.findUnique.mockResolvedValueOnce(
      deployment({ status: "deploying", imageDigest: `sha256:${"a".repeat(64)}` }),
    );
    const service = new AppDeploymentService({ enqueue });

    await expect(
      service.updateFromCallback("deployment-1", "callback-secret", {
        status: "live",
        serviceName: "another-app",
        url: "https://another-app.apps.trace.example.com",
      }),
    ).rejects.toThrow("service name does not match this app");
    expect(prismaMock.appDeployment.update).not.toHaveBeenCalled();
  });

  it("keeps transient dispatch failures queued for reconciliation", async () => {
    enqueue.mockRejectedValueOnce(new Error("queue unavailable"));
    const service = new AppDeploymentService({ enqueue });

    const result = await service.deploy(serviceInput, "org-1", "user-1");

    expect(result.status).toBe("queued");
    expect(prismaMock.appDeployment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "deployment-1" },
        data: expect.objectContaining({ dispatchAttempts: 1, errorMessage: "queue unavailable" }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("reconciles a queued deployment after the original request exits", async () => {
    prismaMock.appDeployment.findMany.mockResolvedValueOnce([{ id: "deployment-1" }]);
    const service = new AppDeploymentService({ enqueue });

    const reconciled = await service.reconcilePendingDispatches();

    expect(reconciled).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "deployment-1", commitSha: "a".repeat(40) }),
    );
  });

  it("rejects callbacks after a deployment has been superseded", async () => {
    prismaMock.appDeployment.findUnique.mockResolvedValueOnce(
      deployment({ status: "superseded", completedAt: now }),
    );
    const service = new AppDeploymentService({ enqueue });

    const result = await service.updateFromCallback("deployment-1", "callback-secret", {
      status: "deploying",
    });

    expect(result.accepted).toBe(false);
    expect(prismaMock.appDeployment.update).not.toHaveBeenCalled();
  });

  it("accepts duplicate nonterminal callbacks so trusted promotion can resume", async () => {
    prismaMock.appDeployment.findUnique.mockResolvedValueOnce(deployment({ status: "deploying" }));
    const service = new AppDeploymentService({ enqueue });

    const result = await service.updateFromCallback("deployment-1", "callback-secret", {
      status: "deploying",
    });

    expect(result.accepted).toBe(true);
    expect(prismaMock.appDeployment.update).not.toHaveBeenCalled();
  });

  it("expires orphaned queued deployments and emits the failure", async () => {
    const stale = deployment({ updatedAt: new Date(now.getTime() - 16 * 60 * 1000) });
    prismaMock.appDeployment.findMany.mockResolvedValueOnce([stale]);
    prismaMock.appDeployment.updateMany.mockResolvedValueOnce({ count: 1 });
    const service = new AppDeploymentService({ enqueue });

    await expect(service.expireStaleDeployments()).resolves.toBe(1);
    expect(prismaMock.appDeployment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "Deployment timed out while queued",
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: "app_deployment_updated",
        payload: expect.objectContaining({
          deployment: expect.objectContaining({
            status: "failed",
            errorMessage: "Deployment timed out while queued",
          }),
        }),
      }),
    );
  });
});
