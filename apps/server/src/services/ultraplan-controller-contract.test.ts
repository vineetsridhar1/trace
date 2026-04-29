import { describe, expect, it } from "vitest";
import {
  buildControllerRunPrompt,
  validateControllerRunSummaryPayload,
  validateControllerRuntimeActionRequest,
} from "./ultraplan-controller-contract.js";

const validSummaryPayload = {
  schemaVersion: 1,
  outcome: "plan_updated",
  summary: "Created a linear ticket plan and queued the first worker.",
  actions: [
    {
      action: "ticket.create",
      result: "success",
      targetType: "ticket",
      targetId: "ticket-1",
      note: "Added acceptance criteria and test plan.",
    },
    {
      action: "ticket.addDependency",
      result: "success",
      targetType: "ticket",
      targetId: "ticket-2",
    },
  ],
  plannedTickets: [
    {
      ticketId: "ticket-1",
      title: "Build context packet",
      status: "planned",
      dependsOnTicketIds: [],
      dependencyRationale: null,
    },
    {
      ticketId: "ticket-2",
      title: "Launch worker",
      status: "planned",
      dependsOnTicketIds: ["ticket-1"],
      dependencyRationale: "Worker launch needs the context packet first.",
    },
  ],
  workerExecutions: [
    {
      ticketExecutionId: "execution-1",
      ticketId: "ticket-1",
      status: "running",
      branchName: "ultraplan/ticket-1",
      summary: "Worker started.",
    },
  ],
  humanGates: [
    {
      inboxItemId: null,
      reason: "No validation needed yet.",
      status: "not_requested",
    },
  ],
  nextSteps: ["Review worker output."],
};

describe("ultraplan controller contract", () => {
  it("accepts allowed runtime action requests with JSON object inputs", () => {
    const result = validateControllerRuntimeActionRequest({
      action: "ultraplan.addPlannedTicket",
      json: { ultraplanId: "ultra-1", ticketId: "ticket-1", position: 1 },
    });

    expect(result).toEqual({
      action: "ultraplan.addPlannedTicket",
      json: { ultraplanId: "ultra-1", ticketId: "ticket-1", position: 1 },
    });
  });

  it("rejects unsupported and non-object runtime action requests", () => {
    expect(() =>
      validateControllerRuntimeActionRequest({
        action: "db.event.create",
        json: { eventType: "ultraplan_updated" },
      }),
    ).toThrow('Unsupported Ultraplan controller action "db.event.create"');

    expect(() =>
      validateControllerRuntimeActionRequest({
        action: "ticket.create",
        json: "not-json-object",
      }),
    ).toThrow("Ultraplan controller action input must be a JSON object");
  });

  it("validates structured controller run summaries", () => {
    expect(validateControllerRunSummaryPayload(validSummaryPayload)).toMatchObject({
      schemaVersion: 1,
      outcome: "plan_updated",
      plannedTickets: [
        { ticketId: "ticket-1", dependsOnTicketIds: [] },
        { ticketId: "ticket-2", dependsOnTicketIds: ["ticket-1"] },
      ],
    });
  });

  it("rejects malformed or missing summary fields", () => {
    expect(() => validateControllerRunSummaryPayload(null)).toThrow(
      "summaryPayload must be an object",
    );
    expect(() =>
      validateControllerRunSummaryPayload({ ...validSummaryPayload, schemaVersion: 2 }),
    ).toThrow("Controller run summary schemaVersion must be 1");
    expect(() =>
      validateControllerRunSummaryPayload({
        ...validSummaryPayload,
        actions: [{ action: "git.commit", result: "success" }],
      }),
    ).toThrow("summaryPayload.actions[0].action is not supported");
    expect(() =>
      validateControllerRunSummaryPayload({
        ...validSummaryPayload,
        plannedTickets: [{ ticketId: "ticket-1", title: "Ticket", status: "planned" }],
      }),
    ).toThrow("summaryPayload.plannedTickets[0].dependsOnTicketIds must be an array");
  });

  it("includes the service boundary and summary contract in the controller prompt", () => {
    const prompt = buildControllerRunPrompt({
      goal: "Ship autopilot",
      ultraplanId: "ultra-1",
      runId: "run-1",
      sessionGroupId: "group-1",
    });

    expect(prompt).toContain("Do not write directly to the database, event store, or git repository");
    expect(prompt).toContain("trace-agent <action> --json");
    expect(prompt).toContain("ultraplan.addPlannedTicket");
    expect(prompt).toContain("trace-agent ultraplan.completeControllerRun");
    expect(prompt).toContain("acceptance criteria and a test plan");
    expect(prompt).toContain("Create durable Ultraplan planned-ticket membership");
    expect(prompt).toContain("Missing or malformed completion JSON fails");
  });
});
