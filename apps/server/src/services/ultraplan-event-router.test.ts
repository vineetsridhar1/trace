import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../agent/router.js";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./ultraplan.js", () => ({
  ultraplanService: {
    runControllerForEvent: vi.fn().mockResolvedValue({ id: "run-new" }),
  },
}));

vi.mock("./ultraplan-controller-run.js", () => ({
  ultraplanControllerRunService: {
    failRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed" }),
  },
}));

import { prisma } from "../lib/db.js";
import { ultraplanService } from "./ultraplan.js";
import { ultraplanControllerRunService } from "./ultraplan-controller-run.js";
import { classifyUltraplanEvent, UltraplanEventRouter } from "./ultraplan-event-router.js";

type MockedDeep<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K] extends object
      ? MockedDeep<T[K]>
      : T[K];
};

const prismaMock = prisma as unknown as MockedDeep<typeof prisma>;
const ultraplanServiceMock = ultraplanService as unknown as MockedDeep<typeof ultraplanService>;
const controllerRunServiceMock = ultraplanControllerRunService as unknown as MockedDeep<
  typeof ultraplanControllerRunService
>;

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: "evt-1",
    organizationId: "org-1",
    scopeType: "session",
    scopeId: "worker-session-1",
    eventType: "session_terminated",
    actorType: "system",
    actorId: "system",
    payload: {
      sessionId: "worker-session-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    },
    timestamp: "2026-04-29T12:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "worker-session-1",
    role: "agent",
    sessionGroupId: "group-1",
    name: "Worker session",
    ...overrides,
  };
}

function makeTicketExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: "execution-1",
    organizationId: "org-1",
    ultraplanId: "ultra-1",
    ticketId: "ticket-1",
    workerSessionId: "worker-session-1",
    status: "running",
    updatedAt: new Date("2026-04-29T12:00:00.000Z"),
    ultraplan: { id: "ultra-1", status: "running" },
    ticket: { id: "ticket-1", title: "Add event router" },
    ...overrides,
  };
}

describe("classifyUltraplanEvent", () => {
  it("ignores session output", () => {
    expect(classifyUltraplanEvent(makeEvent({ eventType: "session_output" }))).toEqual({
      decision: "ignore",
      reason: "session_output",
    });
  });

  it("classifies terminal session termination events", () => {
    expect(classifyUltraplanEvent(makeEvent())).toEqual({
      decision: "session_terminated",
      sessionId: "worker-session-1",
      status: "done",
    });
  });

  it("ignores non-terminal session termination statuses", () => {
    expect(
      classifyUltraplanEvent(makeEvent({ payload: { sessionId: "s1", agentStatus: "active" } })),
    ).toEqual({
      decision: "ignore",
      reason: "non_terminal_status",
    });
  });
});

describe("UltraplanEventRouter", () => {
  let router: UltraplanEventRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new UltraplanEventRouter();
    prismaMock.session.findFirst.mockResolvedValue(makeSession());
    prismaMock.ultraplanControllerRun.findFirst.mockResolvedValue(null);
    prismaMock.ticketExecution.findFirst.mockResolvedValue(makeTicketExecution());
    ultraplanServiceMock.runControllerForEvent.mockResolvedValue({ id: "run-new" });
    controllerRunServiceMock.failRun.mockResolvedValue({ id: "run-1", status: "failed" });
  });

  it("wakes the controller when an active ticket worker terminates successfully", async () => {
    const result = await router.handleEvent(makeEvent());

    expect(result).toEqual({
      handled: true,
      reason: "worker_termination_woke_controller",
      ultraplanId: "ultra-1",
      controllerRunId: "run-new",
    });
    expect(ultraplanServiceMock.runControllerForEvent).toHaveBeenCalledWith({
      id: "ultra-1",
      actorType: "system",
      actorId: "system",
      triggerEventId: "evt-1",
      triggerType: "worker_session_terminated",
      inputSummary: "Worker session done: Add event router",
    });
  });

  it("wakes the controller when a worker fails", async () => {
    await router.handleEvent(
      makeEvent({
        id: "evt-failed",
        payload: { sessionId: "worker-session-1", agentStatus: "failed" },
      }),
    );

    expect(ultraplanServiceMock.runControllerForEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerEventId: "evt-failed",
        inputSummary: "Worker session failed: Add event router",
      }),
    );
  });

  it("wakes the controller when a worker is stopped with an active ticket execution", async () => {
    await router.handleEvent(
      makeEvent({
        id: "evt-stopped",
        payload: { sessionId: "worker-session-1", agentStatus: "stopped" },
      }),
    );

    expect(ultraplanServiceMock.runControllerForEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerEventId: "evt-stopped",
        inputSummary: "Worker session stopped: Add event router",
      }),
    );
  });

  it("dedupes already-triggered controller runs", async () => {
    prismaMock.ultraplanControllerRun.findFirst.mockResolvedValueOnce({
      id: "run-existing",
      ultraplanId: "ultra-1",
    });

    const result = await router.handleEvent(makeEvent());

    expect(result).toEqual({
      handled: true,
      reason: "duplicate_trigger",
      ultraplanId: "ultra-1",
      controllerRunId: "run-existing",
    });
    expect(ultraplanServiceMock.runControllerForEvent).not.toHaveBeenCalled();
  });

  it("does not handle worker termination without an active ticket execution", async () => {
    prismaMock.ticketExecution.findFirst.mockResolvedValue(null);

    const result = await router.handleEvent(makeEvent());

    expect(result).toEqual({ handled: false, reason: "no_active_ticket_execution" });
    expect(ultraplanServiceMock.runControllerForEvent).not.toHaveBeenCalled();
  });

  it("wakes the controller when an Ultraplan gate is resolved", async () => {
    prismaMock.ultraplan.findFirst.mockResolvedValue({ id: "ultra-1", status: "waiting" });

    const result = await router.handleEvent(
      makeEvent({
        id: "evt-gate",
        eventType: "inbox_item_resolved",
        scopeType: "system",
        scopeId: "org-1",
        payload: {
          resolution: "approved",
          inboxItem: {
            id: "inbox-1",
            sourceType: "ticket_execution",
            sourceId: "execution-1",
            title: "Validate ticket",
            payload: {
              ultraplanId: "ultra-1",
              sessionGroupId: "group-1",
            },
          },
        },
      }),
    );

    expect(result).toEqual({
      handled: true,
      reason: "gate_resolution_woke_controller",
      ultraplanId: "ultra-1",
      controllerRunId: "run-new",
    });
    expect(ultraplanServiceMock.runControllerForEvent).toHaveBeenCalledWith({
      id: "ultra-1",
      actorType: "system",
      actorId: "system",
      triggerEventId: "evt-gate",
      triggerType: "ultraplan_gate_resolved",
      inputSummary: "Human gate approved: Validate ticket",
    });
  });

  it("fails a non-terminal controller run when its session terminates without a summary", async () => {
    prismaMock.session.findFirst.mockResolvedValue(
      makeSession({ id: "controller-session-1", role: "ultraplan_controller_run" }),
    );
    prismaMock.ultraplanControllerRun.findFirst.mockResolvedValueOnce({
      id: "run-1",
      ultraplanId: "ultra-1",
      status: "running",
      summary: null,
      summaryTitle: null,
    });

    const result = await router.handleEvent(
      makeEvent({
        scopeId: "controller-session-1",
        payload: { sessionId: "controller-session-1", agentStatus: "done" },
      }),
    );

    expect(result).toEqual({
      handled: true,
      reason: "controller_run_failed_missing_summary",
      ultraplanId: "ultra-1",
      controllerRunId: "run-1",
    });
    expect(controllerRunServiceMock.failRun).toHaveBeenCalledWith(
      "run-1",
      "Controller session done without a valid completion summary",
      "system",
      "system",
    );
    expect(ultraplanServiceMock.runControllerForEvent).not.toHaveBeenCalled();
  });

  it("leaves an already completed controller run alone", async () => {
    prismaMock.session.findFirst.mockResolvedValue(
      makeSession({ id: "controller-session-1", role: "ultraplan_controller_run" }),
    );
    prismaMock.ultraplanControllerRun.findFirst.mockResolvedValueOnce({
      id: "run-1",
      ultraplanId: "ultra-1",
      status: "completed",
      summary: "Planned next steps",
      summaryTitle: null,
    });

    const result = await router.handleEvent(
      makeEvent({
        scopeId: "controller-session-1",
        payload: { sessionId: "controller-session-1", agentStatus: "done" },
      }),
    );

    expect(result).toEqual({
      handled: true,
      reason: "controller_run_already_terminal",
      ultraplanId: "ultra-1",
      controllerRunId: "run-1",
    });
    expect(controllerRunServiceMock.failRun).not.toHaveBeenCalled();
  });
});
