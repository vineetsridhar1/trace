import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "lifecycle-event-1" }),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { ProjectTicketExecutionService } from "./project-ticket-execution.js";

const prismaMock = vi.mocked(prisma, true);
const eventServiceMock = vi.mocked(eventService, true);
const timestamp = new Date("2026-05-04T12:00:00.000Z");

function makeRun() {
  return {
    id: "run-1",
    organizationId: "org-1",
    projectId: "project-1",
    initialGoal: "Ship autopilot",
    planSummary: "Plan",
    project: { id: "project-1", name: "Autopilot", repoId: "repo-1" },
  };
}

function makeTicket() {
  return {
    id: "ticket-1",
    title: "Implement tickets",
    description: "Create linked tickets.",
  };
}

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: "execution-1",
    organizationId: "org-1",
    projectId: "project-1",
    projectRunId: "run-1",
    ticketId: "ticket-1",
    status: "ready",
    sequence: 1,
    implementationSessionId: null,
    reviewSessionId: null,
    fixSessionId: null,
    previousStatus: null,
    lastLifecycleEventId: null,
    lastError: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("ProjectTicketExecutionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
    prismaMock.$executeRaw.mockResolvedValue(0);
  });

  it("starts one implementation session and emits lifecycle events", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeRun());
    prismaMock.ticketProject.findMany.mockResolvedValueOnce([{ ticket: makeTicket() }]);
    prismaMock.projectTicketExecution.findUnique
      .mockResolvedValueOnce(null);
    prismaMock.projectTicketExecution.findUniqueOrThrow.mockResolvedValueOnce(makeExecution());
    prismaMock.projectTicketExecution.findFirst.mockResolvedValueOnce(null);
    prismaMock.projectTicketExecution.findMany.mockResolvedValueOnce([]);
    prismaMock.projectTicketExecution.create.mockResolvedValueOnce(makeExecution());
    prismaMock.projectTicketExecution.update
      .mockResolvedValueOnce(
        makeExecution({
          status: "running",
          previousStatus: "ready",
          implementationSessionId: "session-1",
          startedAt: timestamp,
        }),
      )
      .mockResolvedValueOnce(
        makeExecution({
          status: "running",
          previousStatus: "ready",
          implementationSessionId: "session-1",
          lastLifecycleEventId: "lifecycle-event-1",
          startedAt: timestamp,
        }),
      );
    const start = vi.fn().mockResolvedValue({ id: "session-1" });

    const service = new ProjectTicketExecutionService({ start });
    const execution = await service.startNextOrTicket(
      { projectRunId: "run-1", ticketId: "ticket-1" },
      "org-1",
      "user",
      "user-1",
    );

    expect(execution.implementationSessionId).toBe("session-1");
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1", ticketId: "ticket-1" }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "project_ticket_lifecycle_event",
        payload: expect.objectContaining({
          previousStatus: "ready",
          nextStatus: "running",
          linkedSessionIds: ["session-1"],
        }),
      }),
      prismaMock,
    );
  });

  it("returns an existing active execution without starting another session", async () => {
    prismaMock.projectRun.findFirstOrThrow.mockResolvedValueOnce(makeRun());
    prismaMock.ticketProject.findMany.mockResolvedValueOnce([{ ticket: makeTicket() }]);
    prismaMock.projectTicketExecution.findUnique.mockResolvedValue(
      makeExecution({ status: "running", implementationSessionId: "session-1" }),
    );
    const start = vi.fn();

    const service = new ProjectTicketExecutionService({ start });
    const execution = await service.startNextOrTicket(
      { projectRunId: "run-1", ticketId: "ticket-1" },
      "org-1",
      "user",
      "user-1",
    );

    expect(execution.implementationSessionId).toBe("session-1");
    expect(start).not.toHaveBeenCalled();
  });
});
