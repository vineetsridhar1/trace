import { Prisma } from "@prisma/client";

const RUNTIME_ACTION_NAMES = [
  "ticket.create",
  "ticket.update",
  "ticket.addComment",
  "ticket.updateAcceptanceCriteria",
  "ticket.updateTestPlan",
  "ticket.addDependency",
  "ticket.reorder",
  "ultraplan.addPlannedTicket",
  "ultraplan.updatePlannedTicket",
  "ultraplan.reorderPlannedTickets",
  "ultraplan.createTicketExecution",
  "ultraplan.startWorker",
  "ultraplan.sendWorkerMessage",
  "ultraplan.requestHumanGate",
  "ultraplan.markExecutionReady",
  "ultraplan.markExecutionBlocked",
  "ultraplan.completeControllerRun",
  "integration.mergeTicketBranch",
  "integration.rebaseTicketBranch",
  "integration.reportConflict",
] as const;

export type ControllerRuntimeActionName = (typeof RUNTIME_ACTION_NAMES)[number];

const RUNTIME_ACTION_SET: ReadonlySet<string> = new Set(RUNTIME_ACTION_NAMES);

const SUMMARY_OUTCOMES = [
  "plan_updated",
  "workers_started",
  "needs_human",
  "blocked",
  "completed",
  "no_action",
] as const;

const SUMMARY_OUTCOME_SET: ReadonlySet<string> = new Set(SUMMARY_OUTCOMES);

const HUMAN_GATE_STATUSES = ["requested", "resolved", "not_requested"] as const;
const HUMAN_GATE_STATUS_SET: ReadonlySet<string> = new Set(HUMAN_GATE_STATUSES);

export type ControllerRunSummaryPayload = {
  schemaVersion: 1;
  outcome: (typeof SUMMARY_OUTCOMES)[number];
  summary: string;
  actions: Array<{
    action: ControllerRuntimeActionName;
    result: "success" | "failed";
    targetType?: string;
    targetId?: string;
    note?: string;
  }>;
  plannedTickets: Array<{
    ticketId: string;
    title: string;
    status: string;
    dependsOnTicketIds: string[];
    dependencyRationale?: string | null;
  }>;
  workerExecutions: Array<{
    ticketExecutionId: string;
    ticketId: string;
    status: string;
    branchName?: string | null;
    summary?: string | null;
  }>;
  humanGates: Array<{
    inboxItemId?: string | null;
    reason: string;
    status: (typeof HUMAN_GATE_STATUSES)[number];
  }>;
  nextSteps: string[];
};

export function controllerRuntimeActionNames(): readonly ControllerRuntimeActionName[] {
  return RUNTIME_ACTION_NAMES;
}

export function validateControllerRuntimeActionRequest(input: {
  action: string;
  json: unknown;
}): { action: ControllerRuntimeActionName; json: Record<string, unknown> } {
  if (!RUNTIME_ACTION_SET.has(input.action)) {
    throw new Error(`Unsupported Ultraplan controller action "${input.action}"`);
  }
  if (!isRecord(input.json)) {
    throw new Error("Ultraplan controller action input must be a JSON object");
  }
  return {
    action: input.action as ControllerRuntimeActionName,
    json: input.json,
  };
}

export function buildControllerRunPrompt(input: {
  goal: string;
  ultraplanId: string;
  runId: string;
  sessionGroupId: string;
}): string {
  return [
    "You are the Ultraplan controller for this Trace session group.",
    "",
    "Goal:",
    input.goal,
    "",
    "Trace context:",
    `- Ultraplan id: ${input.ultraplanId}`,
    `- Controller run id: ${input.runId}`,
    `- Session group id: ${input.sessionGroupId}`,
    "",
    "Operating boundary:",
    "- Do not write directly to the database, event store, or git repository.",
    "- Do not create files, commits, branches, or events from this controller chat.",
    "- Perform durable work only through the service-backed `trace-agent` executable.",
    "- If `trace-agent` returns a validation error, report it in the transcript and do not invent a successful result.",
    "",
    "Controller responsibilities:",
    "- Maintain the ordered Ultraplan ticket plan.",
    "- Create or update Trace tickets with acceptance criteria and a test plan before worker execution.",
    "- Record dependency edges and dependency rationale for generated or updated tickets.",
    "- Create durable Ultraplan planned-ticket membership before starting a worker.",
    "- Launch or continue worker sessions when their prerequisites are ready.",
    "- Review completed or failed worker sessions and update current and future tickets.",
    "- Request human gates for validation, conflicts, approvals, or final review.",
    "- Request integration actions only for approved worker branches.",
    "",
    "Runtime action contract:",
    "Use `trace-agent <action> --json '<object>'`. Available actions:",
    ...RUNTIME_ACTION_NAMES.map((name) => `- ${name}`),
    "",
    "Final response contract:",
    "- Every completed controller run must end with one JSON object and no surrounding prose.",
    "- The JSON object must match the `ControllerRunSummaryPayload` schema described in `.claude/skills/ultraplan-controller/SKILL.md`.",
    "- Missing or malformed final JSON fails the controller run visibly.",
  ].join("\n");
}

export function validateControllerRunSummaryPayload(
  value: unknown,
): ControllerRunSummaryPayload {
  const payload = expectRecord(value, "summaryPayload");
  if (payload.schemaVersion !== 1) {
    throw new Error("Controller run summary schemaVersion must be 1");
  }
  const outcome = expectString(payload.outcome, "summaryPayload.outcome");
  if (!SUMMARY_OUTCOME_SET.has(outcome)) {
    throw new Error("Controller run summary outcome is not supported");
  }
  const summary = expectNonEmptyString(payload.summary, "summaryPayload.summary");
  const actions = expectArray(payload.actions, "summaryPayload.actions").map((item, index) =>
    validateSummaryAction(item, index),
  );
  const plannedTickets = expectArray(
    payload.plannedTickets,
    "summaryPayload.plannedTickets",
  ).map((item, index) => validateSummaryPlannedTicket(item, index));
  const workerExecutions = expectArray(
    payload.workerExecutions,
    "summaryPayload.workerExecutions",
  ).map((item, index) => validateSummaryWorkerExecution(item, index));
  const humanGates = expectArray(payload.humanGates, "summaryPayload.humanGates").map(
    (item, index) => validateSummaryHumanGate(item, index),
  );
  const nextSteps = expectArray(payload.nextSteps, "summaryPayload.nextSteps").map(
    (item, index) => expectString(item, `summaryPayload.nextSteps[${index}]`),
  );

  return {
    schemaVersion: 1,
    outcome: outcome as ControllerRunSummaryPayload["outcome"],
    summary,
    actions,
    plannedTickets,
    workerExecutions,
    humanGates,
    nextSteps,
  };
}

export function controllerSummaryToJson(
  payload: ControllerRunSummaryPayload,
): Prisma.InputJsonValue {
  return payload as unknown as Prisma.InputJsonValue;
}

function validateSummaryAction(
  value: unknown,
  index: number,
): ControllerRunSummaryPayload["actions"][number] {
  const action = expectRecord(value, `summaryPayload.actions[${index}]`);
  const actionName = expectString(action.action, `summaryPayload.actions[${index}].action`);
  if (!RUNTIME_ACTION_SET.has(actionName)) {
    throw new Error(`summaryPayload.actions[${index}].action is not supported`);
  }
  const result = expectString(action.result, `summaryPayload.actions[${index}].result`);
  if (result !== "success" && result !== "failed") {
    throw new Error(`summaryPayload.actions[${index}].result must be success or failed`);
  }
  return {
    action: actionName as ControllerRuntimeActionName,
    result,
    targetType: optionalString(action.targetType, `summaryPayload.actions[${index}].targetType`),
    targetId: optionalString(action.targetId, `summaryPayload.actions[${index}].targetId`),
    note: optionalString(action.note, `summaryPayload.actions[${index}].note`),
  };
}

function validateSummaryPlannedTicket(
  value: unknown,
  index: number,
): ControllerRunSummaryPayload["plannedTickets"][number] {
  const ticket = expectRecord(value, `summaryPayload.plannedTickets[${index}]`);
  return {
    ticketId: expectNonEmptyString(
      ticket.ticketId,
      `summaryPayload.plannedTickets[${index}].ticketId`,
    ),
    title: expectNonEmptyString(ticket.title, `summaryPayload.plannedTickets[${index}].title`),
    status: expectNonEmptyString(ticket.status, `summaryPayload.plannedTickets[${index}].status`),
    dependsOnTicketIds: expectArray(
      ticket.dependsOnTicketIds,
      `summaryPayload.plannedTickets[${index}].dependsOnTicketIds`,
    ).map((item, dependsOnIndex) =>
      expectString(
        item,
        `summaryPayload.plannedTickets[${index}].dependsOnTicketIds[${dependsOnIndex}]`,
      ),
    ),
    dependencyRationale: optionalNullableString(
      ticket.dependencyRationale,
      `summaryPayload.plannedTickets[${index}].dependencyRationale`,
    ),
  };
}

function validateSummaryWorkerExecution(
  value: unknown,
  index: number,
): ControllerRunSummaryPayload["workerExecutions"][number] {
  const execution = expectRecord(value, `summaryPayload.workerExecutions[${index}]`);
  return {
    ticketExecutionId: expectNonEmptyString(
      execution.ticketExecutionId,
      `summaryPayload.workerExecutions[${index}].ticketExecutionId`,
    ),
    ticketId: expectNonEmptyString(
      execution.ticketId,
      `summaryPayload.workerExecutions[${index}].ticketId`,
    ),
    status: expectNonEmptyString(
      execution.status,
      `summaryPayload.workerExecutions[${index}].status`,
    ),
    branchName: optionalNullableString(
      execution.branchName,
      `summaryPayload.workerExecutions[${index}].branchName`,
    ),
    summary: optionalNullableString(
      execution.summary,
      `summaryPayload.workerExecutions[${index}].summary`,
    ),
  };
}

function validateSummaryHumanGate(
  value: unknown,
  index: number,
): ControllerRunSummaryPayload["humanGates"][number] {
  const gate = expectRecord(value, `summaryPayload.humanGates[${index}]`);
  const status = expectString(gate.status, `summaryPayload.humanGates[${index}].status`);
  if (!HUMAN_GATE_STATUS_SET.has(status)) {
    throw new Error(`summaryPayload.humanGates[${index}].status is not supported`);
  }
  return {
    inboxItemId: optionalNullableString(
      gate.inboxItemId,
      `summaryPayload.humanGates[${index}].inboxItemId`,
    ),
    reason: expectNonEmptyString(gate.reason, `summaryPayload.humanGates[${index}].reason`),
    status: status as ControllerRunSummaryPayload["humanGates"][number]["status"],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
  return value;
}

function expectNonEmptyString(value: unknown, path: string): string {
  const text = expectString(value, path).trim();
  if (!text) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return text;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return expectString(value, path);
}

function optionalNullableString(value: unknown, path: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  return expectString(value, path);
}
