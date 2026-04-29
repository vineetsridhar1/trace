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

vi.mock("./session.js", () => ({
  sessionService: {
    prepareUltraplanControllerSessionForLaunch: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue({ agentStatus: "active" }),
  },
}));

vi.mock("@trace/shared", () => ({
  getDefaultModel: vi.fn().mockReturnValue("claude-sonnet-4-20250514"),
  isSupportedModel: vi.fn().mockReturnValue(true),
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionService } from "./session.js";
import { UltraplanService } from "./ultraplan.js";
import {
  UltraplanControllerRunService,
  ultraplanControllerRunService,
} from "./ultraplan-controller-run.js";
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
const sessionServiceMock = sessionService as unknown as MockedDeep<typeof sessionService>;
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

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    name: "Ultraplan controller: Build autopilot",
    agentStatus: "not_started",
    sessionStatus: "in_progress",
    role: "ultraplan_controller_run",
    tool: "claude_code",
    model: "claude-sonnet-4-20250514",
    hosting: "cloud",
    organizationId: "org-1",
    createdById: "user-1",
    repoId: "repo-1",
    branch: "ultraplan",
    workdir: "/work/anchovy",
    channelId: "channel-1",
    sessionGroupId: "group-1",
    connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
    worktreeDeleted: false,
    lastUserMessageAt: null,
    lastMessageAt: null,
    createdBy: { id: "user-1", name: "Test User" },
    repo: {
      id: "repo-1",
      name: "trace",
      remoteUrl: "git@github.com:test/trace.git",
      defaultBranch: "main",
    },
    channel: { id: "channel-1", name: "Coding" },
    sessionGroup: makeSessionGroup(),
    createdAt: now,
    updatedAt: now,
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
    prismaMock.session.create.mockResolvedValue(makeSession());
    prismaMock.ultraplanControllerRun.create.mockResolvedValue(makeControllerRun());
    prismaMock.ultraplanControllerRun.update.mockResolvedValue(makeControllerRun());
    prismaMock.ultraplanControllerRun.findUniqueOrThrow.mockResolvedValue(makeControllerRun());
    sessionServiceMock.run.mockResolvedValue(makeSession({ agentStatus: "active" }));
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
          workdir: undefined,
          connection: {
            state: "connected",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
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
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_started",
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
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: "ultraplan",
        scopeId: "ultra-1",
        eventType: "ultraplan_updated",
      }),
      prismaMock,
    );
    expect(sessionServiceMock.prepareUltraplanControllerSessionForLaunch).toHaveBeenCalledWith(
      "session-1",
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

  it("runs the controller now with the last controller session config", async () => {
    prismaMock.ultraplan.findUniqueOrThrow.mockResolvedValue(
      makeUltraplan({ lastControllerRunId: "run-last" }),
    );
    prismaMock.ultraplanControllerRun.findUnique.mockResolvedValue({
      ...makeControllerRun({ id: "run-last" }),
      session: makeSession({
        id: "session-last",
        tool: "codex",
        model: "gpt-5.3-codex",
        hosting: "cloud",
      }),
    });
    prismaMock.ultraplan.update.mockResolvedValue(
      makeUltraplan({ status: "planning", lastControllerRunId: "run-1" }),
    );

    await service.runControllerNow("ultra-1", "user", "user-1");

    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tool: "codex",
          model: "gpt-5.3-codex",
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ultraplan_updated",
        scopeType: "ultraplan",
      }),
      prismaMock,
    );
  });

  it("nudges an existing queued controller run when run-now is repeated", async () => {
    const activeRun = makeControllerRun({ id: "run-active", status: "queued" });
    prismaMock.ultraplan.findUniqueOrThrow.mockResolvedValue(makeUltraplan());
    prismaMock.ultraplanControllerRun.findFirst.mockResolvedValue(activeRun);
    prismaMock.ultraplanControllerRun.findUniqueOrThrow.mockResolvedValue(
      makeControllerRun({ id: "run-active", status: "running" }),
    );

    const result = await service.runControllerNow("ultra-1", "user", "user-1");

    expect(sessionServiceMock.run).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining("Ship autopilot"),
      "plan",
      expect.objectContaining({ clientSource: "ultraplan_controller" }),
    );
    expect(sessionServiceMock.prepareUltraplanControllerSessionForLaunch).toHaveBeenCalledWith(
      "session-1",
    );
    expect(result).toMatchObject({ id: "run-active", status: "running" });
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(prismaMock.ultraplanControllerRun.create).not.toHaveBeenCalled();
    expect(prismaMock.ultraplan.update).not.toHaveBeenCalled();
  });

  it("replaces a queued controller run whose session already failed", async () => {
    const failRunSpy = vi
      .spyOn(ultraplanControllerRunService, "failRun")
      .mockResolvedValueOnce(makeControllerRun({ id: "run-active", status: "failed" }));
    const activeRun = {
      ...makeControllerRun({ id: "run-active", status: "queued" }),
      session: makeSession({
        agentStatus: "failed",
        connection: { state: "disconnected", lastError: "git worktree add failed" },
      }),
    };
    prismaMock.ultraplan.findUniqueOrThrow.mockResolvedValue(makeUltraplan());
    prismaMock.ultraplanControllerRun.findFirst.mockResolvedValue(activeRun);
    prismaMock.ultraplan.update.mockResolvedValue(
      makeUltraplan({ status: "planning", lastControllerRunId: "run-1" }),
    );

    const result = await service.runControllerNow("ultra-1", "user", "user-1");

    expect(failRunSpy).toHaveBeenCalledWith(
      "run-active",
      "git worktree add failed",
      "user",
      "user-1",
    );
    expect(prismaMock.session.create).toHaveBeenCalledWith(expect.any(Object));
    expect(result).toMatchObject({ id: "run-1" });
    failRunSpy.mockRestore();
  });

  it("returns an already running controller run when run-now is repeated", async () => {
    const activeRun = makeControllerRun({ id: "run-active", status: "running" });
    prismaMock.ultraplan.findUniqueOrThrow.mockResolvedValue(makeUltraplan());
    prismaMock.ultraplanControllerRun.findFirst.mockResolvedValue(activeRun);

    const result = await service.runControllerNow("ultra-1", "user", "user-1");

    expect(result).toBe(activeRun);
    expect(sessionServiceMock.run).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(prismaMock.ultraplanControllerRun.create).not.toHaveBeenCalled();
    expect(prismaMock.ultraplan.update).not.toHaveBeenCalled();
  });

  it("authorizes controller-run lifecycle mutations and emits parent plan updates", async () => {
    const controllerRunService = new UltraplanControllerRunService();
    prismaMock.ultraplanControllerRun.findUniqueOrThrow.mockResolvedValue(
      makeControllerRun({ status: "running" }),
    );
    prismaMock.ultraplanControllerRun.update.mockResolvedValue(
      makeControllerRun({
        status: "completed",
        summary: "Finished planning",
        completedAt: now,
      }),
    );
    prismaMock.ultraplan.update.mockResolvedValue(
      makeUltraplan({
        status: "waiting",
        lastControllerRunId: "run-1",
        lastControllerSummary: "Finished planning",
      }),
    );

    await controllerRunService.completeRun(
      "run-1",
      { summary: "Finished planning" },
      "user",
      "user-1",
    );

    expect(prismaMock.orgMember.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: {
            userId: "user-1",
            organizationId: "org-1",
          },
        },
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ultraplan_controller_run_completed",
        scopeType: "ultraplan",
      }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ultraplan_updated",
        scopeType: "ultraplan",
      }),
      prismaMock,
    );
  });

  it("does not mutate controller runs when authorization fails", async () => {
    const controllerRunService = new UltraplanControllerRunService();
    prismaMock.ultraplanControllerRun.findUniqueOrThrow.mockResolvedValue(
      makeControllerRun({ status: "running" }),
    );
    prismaMock.orgMember.findUniqueOrThrow.mockRejectedValue(new Error("not a member"));

    await expect(
      controllerRunService.completeRun("run-1", { summary: "Finished planning" }, "user", "user-2"),
    ).rejects.toThrow("not a member");

    expect(prismaMock.ultraplanControllerRun.update).not.toHaveBeenCalled();
    expect(prismaMock.ultraplan.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });
});
