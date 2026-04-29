import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    bindSession: vi.fn(),
    getRuntime: vi.fn().mockReturnValue(null),
  },
}));

vi.mock("./runtime-access.js", () => ({
  runtimeAccessService: {
    assertAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@trace/shared", () => ({
  getDefaultModel: vi.fn().mockReturnValue("claude-sonnet-4-20250514"),
  isSupportedModel: vi.fn().mockReturnValue(true),
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { UltraplanService } from "./ultraplan.js";
import { isSupportedModel } from "@trace/shared";

type MockedDeep<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K] extends object
      ? MockedDeep<T[K]>
      : T[K];
};

const prismaMock = prisma as unknown as MockedDeep<typeof prisma>;
const eventServiceMock = eventService as unknown as MockedDeep<typeof eventService>;
const isSupportedModelMock = isSupportedModel as unknown as ReturnType<
  typeof vi.fn<(tool: string, model: string) => boolean>
>;

const now = new Date("2026-04-29T12:00:00.000Z");

function makeSessionGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "Build autopilot",
    organizationId: "org-1",
    channelId: "channel-1",
    repoId: "repo-1",
    branch: "ultraplan",
    workdir: "/work/anchovy",
    connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
    repo: {
      id: "repo-1",
      name: "trace",
      remoteUrl: "git@github.com:test/trace.git",
      defaultBranch: "main",
    },
    ...overrides,
  };
}

function makeUltraplan(overrides: Record<string, unknown> = {}) {
  return {
    id: "ultra-1",
    organizationId: "org-1",
    sessionGroupId: "group-1",
    ownerUserId: "user-1",
    status: "planning",
    integrationBranch: "ultraplan",
    integrationWorkdir: "/work/anchovy",
    playbookId: null,
    playbookConfig: null,
    planSummary: "Ship autopilot",
    customInstructions: null,
    activeInboxItemId: null,
    lastControllerRunId: null,
    lastControllerSummary: null,
    sessionGroup: makeSessionGroup(),
    ownerUser: { id: "user-1", name: "Test User" },
    activeInboxItem: null,
    lastControllerRun: null,
    tickets: [],
    ticketExecutions: [],
    controllerRuns: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeControllerRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    organizationId: "org-1",
    ultraplanId: "ultra-1",
    sessionGroupId: "group-1",
    sessionId: "session-1",
    triggerEventId: null,
    triggerType: "initial",
    status: "queued",
    inputSummary: "Ship autopilot",
    summaryTitle: null,
    summary: null,
    summaryPayload: null,
    error: null,
    session: { id: "session-1" },
    generatedTickets: [],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("UltraplanService", () => {
  let service: UltraplanService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UltraplanService();
    eventServiceMock.create.mockResolvedValue({ id: "event-1" });
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
    prismaMock.sessionGroup.findFirst.mockResolvedValue(makeSessionGroup());
    prismaMock.ultraplan.findFirst.mockResolvedValue(null);
    prismaMock.ultraplan.create.mockResolvedValue(makeUltraplan());
    prismaMock.ultraplan.update.mockResolvedValue(makeUltraplan({ lastControllerRunId: "run-1" }));
    prismaMock.session.create.mockResolvedValue({ id: "session-1" });
    prismaMock.ultraplanControllerRun.create.mockResolvedValue(makeControllerRun());
    prismaMock.ultraplanControllerRun.update.mockResolvedValue(makeControllerRun());
    isSupportedModelMock.mockReturnValue(true);
  });

  it("starts an ultraplan and creates an initial controller run session", async () => {
    const result = await service.start({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      goal: "Ship autopilot",
      controllerProvider: "claude_code",
      controllerModel: "claude-sonnet-4-20250514",
      actorType: "user",
      actorId: "user-1",
    });

    expect(result.id).toBe("ultra-1");
    expect(prismaMock.ultraplan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "planning",
          integrationBranch: "ultraplan",
          integrationWorkdir: "/work/anchovy",
          planSummary: "Ship autopilot",
        }),
      }),
    );
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "ultraplan_controller_run",
          tool: "claude_code",
          sessionGroupId: "group-1",
          branch: "ultraplan",
          workdir: "/work/anchovy",
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: "ultraplan",
        scopeId: "ultra-1",
        eventType: "ultraplan_created",
      }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: "ultraplan",
        scopeId: "ultra-1",
        eventType: "ultraplan_controller_run_created",
      }),
      prismaMock,
    );
  });

  it("reuses an active ultraplan instead of duplicating it", async () => {
    prismaMock.ultraplan.findFirst.mockResolvedValue(makeUltraplan({ status: "running" }));

    const result = await service.start({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      goal: "Ship autopilot",
      controllerProvider: "claude_code",
      actorType: "user",
      actorId: "user-1",
    });

    expect(result.status).toBe("running");
    expect(prismaMock.ultraplan.create).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("pauses idempotently and emits only durable state changes", async () => {
    prismaMock.ultraplan.findUniqueOrThrow.mockResolvedValue(makeUltraplan({ status: "running" }));
    prismaMock.ultraplan.update.mockResolvedValue(makeUltraplan({ status: "paused" }));

    const result = await service.pause("ultra-1", "user", "user-1");

    expect(result.status).toBe("paused");
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ultraplan_paused", scopeType: "ultraplan" }),
      prismaMock,
    );

    vi.clearAllMocks();
    prismaMock.ultraplan.findUniqueOrThrow.mockResolvedValue(makeUltraplan({ status: "paused" }));

    const second = await service.pause("ultra-1", "user", "user-1");

    expect(second.status).toBe("paused");
    expect(prismaMock.ultraplan.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("does not persist when authorization fails", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockRejectedValue(new Error("not a member"));

    await expect(
      service.start({
        organizationId: "org-1",
        sessionGroupId: "group-1",
        goal: "Ship autopilot",
        controllerProvider: "claude_code",
        actorType: "user",
        actorId: "user-2",
      }),
    ).rejects.toThrow("not a member");

    expect(prismaMock.ultraplan.create).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("rejects invalid controller config before persistence", async () => {
    isSupportedModelMock.mockReturnValue(false);

    await expect(
      service.start({
        organizationId: "org-1",
        sessionGroupId: "group-1",
        goal: "Ship autopilot",
        controllerProvider: "claude_code",
        controllerModel: "bad-model",
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow('Unsupported model "bad-model"');

    expect(prismaMock.sessionGroup.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.ultraplan.create).not.toHaveBeenCalled();
  });
});
