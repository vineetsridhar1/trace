import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { ProjectRunService } from "./project-run.js";

const prismaMock = vi.mocked(prisma, true);
const eventServiceMock = vi.mocked(eventService, true);
const timestamp = new Date("2026-05-04T12:00:00.000Z");

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    organizationId: "org-1",
    name: "Roadmap",
    repoId: null,
    repo: null,
    aiMode: null,
    soulFile: "",
    channels: [],
    sessions: [],
    tickets: [],
    members: [],
    runs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeProjectRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    organizationId: "org-1",
    projectId: "project-1",
    project: makeProject(),
    status: "interviewing",
    initialGoal: "Build a project planner",
    planSummary: null,
    activeGateId: null,
    latestControllerSummaryId: null,
    latestControllerSummaryText: null,
    executionConfig: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("ProjectRunService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
  });

  it("rejects empty initial goals before creating rows", async () => {
    const service = new ProjectRunService();

    await expect(
      service.createProjectRun({ projectId: "project-1", initialGoal: "   " }, "user", "user-1"),
    ).rejects.toThrow("Initial goal is required");

    expect(prismaMock.projectRun.create).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("creates a project run and emits run-created and goal-submitted events", async () => {
    prismaMock.project.findUniqueOrThrow.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
    });
    prismaMock.projectRun.findFirst.mockResolvedValueOnce(null);
    prismaMock.projectRun.create.mockResolvedValueOnce(makeProjectRun());

    const service = new ProjectRunService();
    await service.createProjectRun(
      { projectId: "project-1", initialGoal: " Build a project planner " },
      "user",
      "user-1",
    );

    expect(prismaMock.projectRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "project-1",
          organizationId: "org-1",
          status: "interviewing",
          initialGoal: "Build a project planner",
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "project_run_created",
        payload: { projectRun: expect.objectContaining({ id: "run-1" }) },
      }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "project_goal_submitted",
        payload: {
          projectRun: expect.objectContaining({ id: "run-1" }),
          goal: "Build a project planner",
        },
      }),
      prismaMock,
    );
  });

  it("rejects a second active run for the same project", async () => {
    prismaMock.project.findUniqueOrThrow.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
    });
    prismaMock.projectRun.findFirst.mockResolvedValueOnce({ id: "run-existing" });

    const service = new ProjectRunService();
    await expect(
      service.createProjectRun(
        { projectId: "project-1", initialGoal: "Build a project planner" },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("Project already has an active run");

    expect(prismaMock.projectRun.create).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("updates a project run and emits an update event", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce({
      id: "run-1",
      organizationId: "org-1",
      projectId: "project-1",
    });
    prismaMock.projectRun.update.mockResolvedValueOnce(
      makeProjectRun({ status: "planning", planSummary: "Plan v1" }),
    );

    const service = new ProjectRunService();
    await service.updateProjectRun(
      "run-1",
      "org-1",
      { status: "planning", planSummary: "Plan v1" },
      "user",
      "user-1",
    );

    expect(prismaMock.projectRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "planning", planSummary: "Plan v1" }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "project_run_updated",
        payload: { projectRun: expect.objectContaining({ id: "run-1", status: "planning" }) },
      }),
      prismaMock,
    );
  });

  it("lists project runs only after verifying the project belongs to the organization", async () => {
    prismaMock.project.findFirstOrThrow.mockResolvedValueOnce({ id: "project-1" });
    prismaMock.projectRun.findMany.mockResolvedValueOnce([makeProjectRun()]);

    const service = new ProjectRunService();
    await expect(service.listProjectRuns("project-1", "org-1")).resolves.toHaveLength(1);

    expect(prismaMock.project.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "project-1", organizationId: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.projectRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project-1", organizationId: "org-1" } }),
    );
  });

  it("creates a project and its first run atomically from a goal", async () => {
    prismaMock.project.create.mockResolvedValueOnce(makeProject());
    prismaMock.projectRun.create.mockResolvedValueOnce(makeProjectRun());
    prismaMock.projectRun.findFirstOrThrow
      .mockResolvedValueOnce(makeProjectRun())
      .mockResolvedValueOnce(makeProjectRun());
    prismaMock.projectRun.update.mockResolvedValueOnce(
      makeProjectRun({ planningSessionId: "session-1" }),
    );
    prismaMock.project.findUniqueOrThrow.mockResolvedValueOnce(
      makeProject({ runs: [makeProjectRun({ planningSessionId: "session-1" })] }),
    );
    const start = vi.fn().mockResolvedValue({ id: "session-1" });

    const service = new ProjectRunService({ start });
    const project = await service.createProjectFromGoal(
      {
        organizationId: "org-1",
        goal: " Build a project planner ",
        name: "Planner",
        planningModel: "claude-opus-4-7[1m]",
        planningHosting: "local",
        planningRuntimeInstanceId: "runtime-1",
        executionConfig: { maxParallelWorkers: 1 },
      },
      "user",
      "user-1",
    );

    expect(project).toMatchObject({ id: "project-1", runs: [{ id: "run-1" }] });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        interactionMode: "plan",
        model: "claude-opus-4-7[1m]",
        hosting: "local",
        runtimeInstanceId: "runtime-1",
      }),
    );
    const planningPrompt = start.mock.calls[0]?.[0]?.prompt;
    expect(planningPrompt).toContain("<trace-internal>");
    expect(planningPrompt).toContain("</trace-internal>");
    expect(planningPrompt).toContain("Project run id: run-1");
    expect(planningPrompt).toMatch(/<\/trace-internal>\n\nBuild a project planner$/);
    const projectCreateOrder = prismaMock.project.create.mock.invocationCallOrder[0] ?? 0;
    const runCreateOrder = prismaMock.projectRun.create.mock.invocationCallOrder[0] ?? 0;
    expect(projectCreateOrder).toBeLessThan(runCreateOrder);
    expect(eventServiceMock.create).toHaveBeenCalledTimes(5);
    expect(eventServiceMock.create).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        eventType: "project_goal_submitted",
        payload: expect.objectContaining({ goal: "Build a project planner" }),
      }),
      prismaMock,
    );
  });
});
