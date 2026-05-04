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
import { ProjectPlanningService } from "./project-planning.js";

const prismaMock = vi.mocked(prisma, true);
const eventServiceMock = vi.mocked(eventService, true);
const timestamp = new Date("2026-05-04T12:00:00.000Z");

function makeProjectRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    organizationId: "org-1",
    projectId: "project-1",
    project: {
      id: "project-1",
      organizationId: "org-1",
      name: "Roadmap",
    },
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

function makeGenerationAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    organizationId: "org-1",
    projectId: "project-1",
    projectRunId: "run-1",
    status: "running",
    approvedPlan: "Plan v1",
    draftCount: 0,
    createdTicketIds: [],
    draftSnapshot: [],
    error: null,
    retryCount: 1,
    startedAt: timestamp,
    completedAt: null,
    failedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-1",
    title: "Build ticket list",
    description: "Implement the list.",
    status: "backlog",
    priority: "medium",
    labels: ["project-plan"],
    organizationId: "org-1",
    createdById: "user-1",
    createdBy: { id: "user-1", email: "v@example.com", name: "Vineet", avatarUrl: null },
    originEventId: null,
    sourceProjectRunId: "run-1",
    generationAttemptId: "attempt-1",
    generationDraftKey: "001-build-ticket-list",
    channelId: null,
    channel: null,
    aiMode: null,
    projects: [
      {
        projectId: "project-1",
        ticketId: "ticket-1",
        project: {
          id: "project-1",
          organizationId: "org-1",
          name: "Autopilot",
          repoId: null,
          aiMode: null,
          soulFile: "",
          defaultPlaybookVersionId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
    assignees: [],
    links: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("ProjectPlanningService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
    prismaMock.agentIdentity.findUniqueOrThrow.mockResolvedValue({ id: "agent-1" });
  });

  it("records AI questions in the project scope", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeProjectRun());

    const service = new ProjectPlanningService();
    await service.askQuestion(
      { projectRunId: "run-1", message: " Which repo should this target? " },
      "org-1",
      "agent",
      "agent-1",
    );

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        scopeType: "project",
        scopeId: "project-1",
        eventType: "project_question_asked",
        payload: { projectRunId: "run-1", message: "Which repo should this target?" },
        actorType: "agent",
        actorId: "agent-1",
      }),
      prismaMock,
    );
  });

  it("builds canonical planning context from project run state and events", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(
      makeProjectRun({
        project: {
          id: "project-1",
          organizationId: "org-1",
          name: "Roadmap",
          repo: {
            id: "repo-1",
            name: "trace",
            remoteUrl: "git@example.com:trace.git",
            defaultBranch: "main",
          },
          members: [
            {
              role: "admin",
              user: { id: "user-1", name: "Vineet" },
            },
          ],
        },
      }),
    );
    prismaMock.event.findMany.mockResolvedValueOnce([
      {
        id: "evt-q",
        eventType: "project_question_asked",
        payload: { projectRunId: "run-1", message: "Which repo?" },
        actorType: "agent",
        actorId: "agent-1",
      },
      {
        id: "evt-a",
        eventType: "project_answer_recorded",
        payload: { projectRunId: "run-1", message: "Trace." },
        actorType: "user",
        actorId: "user-1",
      },
      {
        id: "evt-other",
        eventType: "project_risk_recorded",
        payload: { projectRunId: "other-run", risk: "Ignore me." },
        actorType: "agent",
        actorId: "agent-1",
      },
    ]);

    const service = new ProjectPlanningService();
    const context = await service.getContext("run-1", "org-1", "agent", "agent-1");

    expect(context.project.id).toBe("project-1");
    expect(context.project.repo?.defaultBranch).toBe("main");
    expect(context.project.members).toEqual([{ id: "user-1", name: "Vineet", role: "admin" }]);
    expect(context.projectRun.initialGoal).toBe("Build a project planner");
    expect(context.questions).toEqual([
      { eventId: "evt-q", message: "Which repo?", actorType: "agent", actorId: "agent-1" },
    ]);
    expect(context.answers).toEqual([
      { eventId: "evt-a", message: "Trace.", actorType: "user", actorId: "user-1" },
    ]);
    expect(context.risks).toEqual([]);
  });

  it("records user answers and decisions as durable planning events", async () => {
    prismaMock.projectRun.findFirstOrThrow
      .mockResolvedValueOnce(makeProjectRun())
      .mockResolvedValueOnce(makeProjectRun());

    const service = new ProjectPlanningService();
    await service.recordAnswer(
      { projectRunId: "run-1", message: "Use the web app first." },
      "org-1",
      "user",
      "user-1",
    );
    await service.recordDecision(
      { projectRunId: "run-1", decision: "Ship project planning before execution." },
      "org-1",
      "user",
      "user-1",
    );

    expect(eventServiceMock.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "project_answer_recorded",
        payload: { projectRunId: "run-1", message: "Use the web app first." },
      }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "project_decision_recorded",
        payload: { projectRunId: "run-1", decision: "Ship project planning before execution." },
      }),
      prismaMock,
    );
  });

  it("records risks without updating the project run summary", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeProjectRun());

    const service = new ProjectPlanningService();
    await service.recordRisk(
      { projectRunId: "run-1", risk: "Ticket generation may need human review." },
      "org-1",
      "agent",
      "agent-1",
    );

    expect(prismaMock.projectRun.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "project_risk_recorded",
        payload: { projectRunId: "run-1", risk: "Ticket generation may need human review." },
      }),
      prismaMock,
    );
  });

  it("updates the durable plan summary and emits a snapshot event", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeProjectRun());
    prismaMock.projectRun.findFirst.mockResolvedValueOnce(null);
    prismaMock.projectRun.update.mockResolvedValueOnce(
      makeProjectRun({ status: "planning", planSummary: "Plan v1" }),
    );

    const service = new ProjectPlanningService();
    await service.updatePlanSummary(
      { projectRunId: "run-1", planSummary: " Plan v1 ", status: "planning" },
      "org-1",
      "agent",
      "agent-1",
    );

    expect(prismaMock.projectRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: { planSummary: "Plan v1", status: "planning" },
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "project_plan_summary_updated",
        payload: {
          projectRun: expect.objectContaining({
            id: "run-1",
            status: "planning",
            planSummary: "Plan v1",
          }),
        },
      }),
      prismaMock,
    );
  });

  it("rejects summary status updates that would create a second active run", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeProjectRun());
    prismaMock.projectRun.findFirst.mockResolvedValueOnce({ id: "run-existing" });

    const service = new ProjectPlanningService();
    await expect(
      service.updatePlanSummary(
        { projectRunId: "run-1", planSummary: "Plan v1", status: "planning" },
        "org-1",
        "agent",
        "agent-1",
      ),
    ).rejects.toThrow("Project already has an active run");

    expect(prismaMock.projectRun.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("rejects empty planning messages before writing events", async () => {
    const service = new ProjectPlanningService();

    await expect(
      service.recordAnswer({ projectRunId: "run-1", message: "   " }, "org-1", "user", "user-1"),
    ).rejects.toThrow("Answer is required");

    expect(prismaMock.projectRun.findFirstOrThrow).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("approves a plan, validates structured drafts, and creates linked tickets once", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(
      makeProjectRun({
        project: { id: "project-1", name: "Autopilot", repoId: null },
      }),
    );
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.projectRun.update
      .mockResolvedValueOnce(makeProjectRun({ planSummary: "Plan v1" }))
      .mockResolvedValueOnce(makeProjectRun({ status: "ready", planSummary: "Plan v1" }));
    prismaMock.projectTicketGenerationAttempt.findUnique.mockResolvedValueOnce(null);
    prismaMock.projectTicketGenerationAttempt.create.mockResolvedValueOnce(makeGenerationAttempt());
    prismaMock.projectTicketGenerationAttempt.findUniqueOrThrow.mockResolvedValueOnce(
      makeGenerationAttempt(),
    );
    prismaMock.ticket.findUnique.mockResolvedValueOnce(null);
    prismaMock.ticket.create.mockResolvedValueOnce(makeTicket());
    prismaMock.projectTicketGenerationAttempt.update.mockResolvedValueOnce(
      makeGenerationAttempt({
        status: "completed",
        draftCount: 1,
        createdTicketIds: ["ticket-1"],
        completedAt: timestamp,
      }),
    );

    const service = new ProjectPlanningService();
    const attempt = await service.approvePlanAndGenerateTickets(
      {
        projectRunId: "run-1",
        planSummary: " Plan v1 ",
        structuredDrafts: [
          {
            title: "Build ticket list",
            description: "Implement the list.",
            priority: "medium",
            labels: ["frontend"],
            acceptanceCriteria: ["Shows generated tickets"],
          },
        ],
      },
      "org-1",
      "user",
      "user-1",
    );

    expect(attempt.status).toBe("completed");
    expect(prismaMock.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projects: { create: { projectId: "project-1" } },
          generationAttemptId: "attempt-1",
          generationDraftKey: "001-build-ticket-list",
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "project_ticket_generation_completed" }),
      prismaMock,
    );
  });

  it("approves a plan without server-side ticket draft generation", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(
      makeProjectRun({
        project: { id: "project-1", name: "Autopilot", repoId: null },
      }),
    );
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.projectRun.update.mockResolvedValueOnce(makeProjectRun({ planSummary: "Plan v1" }));
    prismaMock.projectTicketGenerationAttempt.findUnique.mockResolvedValueOnce(null);
    prismaMock.projectTicketGenerationAttempt.create.mockResolvedValueOnce(
      makeGenerationAttempt({ status: "pending", startedAt: null }),
    );

    const service = new ProjectPlanningService();
    const attempt = await service.approvePlanAndGenerateTickets(
      { projectRunId: "run-1", planSummary: " Plan v1 " },
      "org-1",
      "user",
      "user-1",
    );

    expect(attempt.status).toBe("pending");
    expect(prismaMock.ticket.create).not.toHaveBeenCalled();
    expect(prismaMock.projectTicketGenerationAttempt.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "project_ticket_generation_started",
        payload: expect.objectContaining({
          generationAttempt: expect.objectContaining({ status: "pending" }),
        }),
      }),
      prismaMock,
    );
  });

  it("returns a completed generation attempt without creating duplicate tickets", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(
      makeProjectRun({
        project: { id: "project-1", name: "Autopilot", repoId: null },
      }),
    );
    prismaMock.projectTicketGenerationAttempt.findUnique.mockResolvedValueOnce(
      makeGenerationAttempt({ status: "completed", createdTicketIds: ["ticket-1"] }),
    );

    const service = new ProjectPlanningService();
    const attempt = await service.approvePlanAndGenerateTickets(
      { projectRunId: "run-1", planSummary: "Plan v1" },
      "org-1",
      "user",
      "user-1",
    );

    expect(attempt.status).toBe("completed");
    expect(prismaMock.projectRun.update).not.toHaveBeenCalled();
    expect(prismaMock.ticket.create).not.toHaveBeenCalled();
  });
});
