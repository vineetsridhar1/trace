import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, OrchestratorEpisode, ProjectRunStatus } from "@prisma/client";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "episode-event-1" }),
  },
}));

vi.mock("./processed-event.js", () => ({
  processedEventService: {
    isProcessed: vi.fn().mockResolvedValue(false),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./session.js", () => ({
  sessionService: {
    start: vi.fn(),
  },
}));

vi.mock("./playbook.js", () => ({
  playbookService: {
    snapshotForProjectRun: vi.fn().mockResolvedValue({
      versionId: "playbook-version-1",
      snapshot: { version: { id: "playbook-version-1", content: "Default playbook" } },
      content: "Default playbook",
    }),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { processedEventService } from "./processed-event.js";
import { OrchestratorEpisodeService } from "./orchestrator-episode.js";

const prismaMock = vi.mocked(prisma, true);
const eventServiceMock = vi.mocked(eventService, true);
const processedEventServiceMock = vi.mocked(processedEventService, true);
const timestamp = new Date("2026-05-04T12:00:00.000Z");

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    organizationId: "org-1",
    scopeType: "project",
    scopeId: "project-1",
    eventType: "project_run_updated",
    payload: { projectRunId: "run-1" },
    actorType: "system",
    actorId: "system",
    parentId: null,
    metadata: {},
    timestamp,
    ...overrides,
  };
}

function makeProjectRun(status: ProjectRunStatus = "running") {
  return {
    id: "run-1",
    organizationId: "org-1",
    projectId: "project-1",
    status,
    initialGoal: "Ship autopilot",
    planSummary: "Plan",
    executionConfig: {},
    project: { id: "project-1", name: "Autopilot", repoId: "repo-1" },
  };
}

function makeEpisode(
  overrides: Partial<OrchestratorEpisode> = {},
): OrchestratorEpisode {
  return {
    id: "episode-1",
    organizationId: "org-1",
    projectId: "project-1",
    projectRunId: "run-1",
    triggerEventId: "event-1",
    sessionId: null,
    status: "pending",
    playbookVersionId: null,
    playbookSnapshot: {},
    contextHash: "hash-1",
    contextSnapshot: {},
    actionResults: [],
    decisionSummary: null,
    retryCount: 0,
    lastError: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeService(start = vi.fn().mockResolvedValue({ id: "session-1" })) {
  return {
    service: new OrchestratorEpisodeService({
      start,
    } as unknown as ConstructorParameters<typeof OrchestratorEpisodeService>[0]),
    start,
  };
}

function mockStartableRun() {
  prismaMock.event.findFirstOrThrow.mockResolvedValueOnce(makeEvent());
  prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeProjectRun());
  prismaMock.orchestratorEpisode.findUnique.mockResolvedValueOnce(null);
  prismaMock.orchestratorEpisode.create.mockResolvedValueOnce(makeEpisode());
  prismaMock.orchestratorEpisode.updateMany.mockResolvedValueOnce({ count: 1 });
  prismaMock.orchestratorEpisode.findUniqueOrThrow.mockResolvedValueOnce(
    makeEpisode({ status: "starting", retryCount: 1, startedAt: timestamp }),
  );
  prismaMock.orchestratorEpisode.update.mockResolvedValueOnce(
    makeEpisode({
      status: "running",
      sessionId: "session-1",
      retryCount: 1,
      startedAt: timestamp,
      decisionSummary: "Started orchestrator episode session.",
    }),
  );
  prismaMock.projectMember.findMany.mockResolvedValueOnce([{ userId: "user-1" }]);
  prismaMock.agentIdentity.findUnique.mockResolvedValueOnce({ id: "agent-identity-1" });
}

describe("OrchestratorEpisodeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
    prismaMock.$executeRaw.mockResolvedValue(0);
  });

  it("creates an episode and starts a normal coding-tool session for a lifecycle event", async () => {
    mockStartableRun();
    const { service, start } = makeService();

    const episode = await service.startForLifecycleEvent({
      triggerEventId: "event-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(episode.status).toBe("running");
    expect(prismaMock.orchestratorEpisode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          projectId: "project-1",
          projectRunId: "run-1",
          triggerEventId: "event-1",
          status: "pending",
        }),
      }),
    );
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        createdById: "user-1",
        actorType: "agent",
        actorId: "agent-identity-1",
        tool: "claude_code",
        repoId: "repo-1",
        projectId: "project-1",
        interactionMode: "orchestrator",
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "orchestrator_episode_created" }),
      prismaMock,
    );
  });

  it("does not duplicate sessions for an existing running episode", async () => {
    prismaMock.event.findFirstOrThrow.mockResolvedValueOnce(makeEvent());
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeProjectRun());
    prismaMock.orchestratorEpisode.findUnique.mockResolvedValueOnce(
      makeEpisode({ status: "running", sessionId: "session-1" }),
    );
    const { service, start } = makeService();

    const episode = await service.startForLifecycleEvent({
      triggerEventId: "event-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(episode.sessionId).toBe("session-1");
    expect(start).not.toHaveBeenCalled();
    expect(prismaMock.orchestratorEpisode.create).not.toHaveBeenCalled();
  });

  it("records failed startup so the episode is visible and retryable", async () => {
    const start = vi.fn().mockRejectedValue(new Error("no runtime"));
    mockStartableRun();
    prismaMock.orchestratorEpisode.update.mockReset();
    prismaMock.orchestratorEpisode.update.mockResolvedValueOnce(
      makeEpisode({ status: "failed", retryCount: 1, lastError: "no runtime", failedAt: timestamp }),
    );
    const { service } = makeService(start);

    const episode = await service.startForLifecycleEvent({
      triggerEventId: "event-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(episode.status).toBe("failed");
    expect(episode.lastError).toBe("no runtime");
  });

  it("does not start episodes for paused project runs", async () => {
    prismaMock.event.findFirstOrThrow.mockResolvedValueOnce(makeEvent());
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeProjectRun("paused"));
    const { service, start } = makeService();

    await expect(
      service.startForLifecycleEvent({
        triggerEventId: "event-1",
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("Project run is paused");

    expect(start).not.toHaveBeenCalled();
    expect(prismaMock.orchestratorEpisode.create).not.toHaveBeenCalled();
  });

  it("uses the dedicated processed-event path for lifecycle handling", async () => {
    processedEventServiceMock.isProcessed.mockResolvedValueOnce(true);
    prismaMock.orchestratorEpisode.findUniqueOrThrow.mockResolvedValueOnce(
      makeEpisode({ status: "running", sessionId: "session-1" }),
    );
    const { service } = makeService();

    const episode = await service.handleLifecycleEvent({
      triggerEventId: "event-1",
      organizationId: "org-1",
    });

    expect(episode.sessionId).toBe("session-1");
    expect(processedEventServiceMock.isProcessed).toHaveBeenCalledWith(
      "project-orchestrator",
      "event-1",
    );
    expect(prismaMock.event.findFirstOrThrow).not.toHaveBeenCalled();
  });
});
