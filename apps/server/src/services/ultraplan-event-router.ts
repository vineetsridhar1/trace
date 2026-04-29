import { prisma } from "../lib/db.js";
import type { AgentEvent } from "../agent/router.js";
import { ultraplanService } from "./ultraplan.js";
import { ultraplanControllerRunService } from "./ultraplan-controller-run.js";

const WORKER_TERMINAL_STATUSES = new Set(["done", "failed", "stopped"]);
const ACTIVE_EXECUTION_STATUSES = [
  "running",
  "reviewing",
  "needs_human",
  "ready_to_integrate",
  "integrating",
  "blocked",
  "failed",
] as const;

type Classification =
  | { decision: "ignore"; reason: string }
  | { decision: "session_terminated"; sessionId: string; status: string }
  | { decision: "inbox_gate_resolved" };

export type UltraplanEventRouterResult =
  | { handled: false; reason: string }
  | { handled: true; reason: string; ultraplanId?: string; controllerRunId?: string };

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function classifyUltraplanEvent(event: AgentEvent): Classification {
  if (event.eventType === "session_output") {
    return { decision: "ignore", reason: "session_output" };
  }

  if (event.eventType === "inbox_item_resolved") {
    return { decision: "inbox_gate_resolved" };
  }

  if (event.eventType !== "session_terminated") {
    return { decision: "ignore", reason: "not_ultraplan_lifecycle" };
  }

  const sessionId = stringValue(event.payload.sessionId) ?? event.scopeId;
  const status = stringValue(event.payload.agentStatus);
  if (!status || !WORKER_TERMINAL_STATUSES.has(status)) {
    return { decision: "ignore", reason: "non_terminal_status" };
  }

  return { decision: "session_terminated", sessionId, status };
}

export class UltraplanEventRouter {
  private readonly inFlightBySessionGroup = new Map<string, Promise<UltraplanEventRouterResult>>();

  async handleEvent(event: AgentEvent): Promise<UltraplanEventRouterResult> {
    const classification = classifyUltraplanEvent(event);
    if (classification.decision === "ignore") {
      return { handled: false, reason: classification.reason };
    }

    if (classification.decision === "inbox_gate_resolved") {
      return this.handleInboxGateResolution(event);
    }

    const session = await prisma.session.findFirst({
      where: { id: classification.sessionId, organizationId: event.organizationId },
      select: { id: true, role: true, sessionGroupId: true, name: true },
    });
    if (!session?.sessionGroupId) {
      return { handled: false, reason: "session_not_found" };
    }

    if (session.role === "ultraplan_controller_run") {
      return this.withSessionGroupLock(session.sessionGroupId, () =>
        this.handleControllerTermination(event, session.id, classification.status),
      );
    }

    return this.withSessionGroupLock(session.sessionGroupId, () =>
      this.handleWorkerTermination(event, session.id, classification.status),
    );
  }

  private async withSessionGroupLock(
    sessionGroupId: string,
    task: () => Promise<UltraplanEventRouterResult>,
  ): Promise<UltraplanEventRouterResult> {
    const current = this.inFlightBySessionGroup.get(sessionGroupId);
    if (current) await current.catch(() => undefined);

    const next = task();
    this.inFlightBySessionGroup.set(sessionGroupId, next);
    try {
      return await next;
    } finally {
      if (this.inFlightBySessionGroup.get(sessionGroupId) === next) {
        this.inFlightBySessionGroup.delete(sessionGroupId);
      }
    }
  }

  private async handleWorkerTermination(
    event: AgentEvent,
    sessionId: string,
    status: string,
  ): Promise<UltraplanEventRouterResult> {
    const existingRun = await prisma.ultraplanControllerRun.findFirst({
      where: {
        organizationId: event.organizationId,
        triggerEventId: event.id,
      },
      select: { id: true, ultraplanId: true },
    });
    if (existingRun) {
      return {
        handled: true,
        reason: "duplicate_trigger",
        ultraplanId: existingRun.ultraplanId,
        controllerRunId: existingRun.id,
      };
    }

    const execution = await prisma.ticketExecution.findFirst({
      where: {
        organizationId: event.organizationId,
        workerSessionId: sessionId,
        status: { in: [...ACTIVE_EXECUTION_STATUSES] },
      },
      include: { ultraplan: true, ticket: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!execution) {
      return { handled: false, reason: "no_active_ticket_execution" };
    }
    if (["completed", "failed", "cancelled", "paused"].includes(execution.ultraplan.status)) {
      return { handled: false, reason: "inactive_ultraplan" };
    }

    const ticketTitle = execution.ticket?.title ?? execution.ticketId;
    const run = await ultraplanService.runControllerForEvent({
      id: execution.ultraplanId,
      actorType: "system",
      actorId: "system",
      triggerEventId: event.id,
      triggerType: "worker_session_terminated",
      inputSummary: `Worker session ${status}: ${ticketTitle}`,
    });

    return {
      handled: true,
      reason: "worker_termination_woke_controller",
      ultraplanId: execution.ultraplanId,
      controllerRunId: run.id,
    };
  }

  private async handleControllerTermination(
    event: AgentEvent,
    sessionId: string,
    status: string,
  ): Promise<UltraplanEventRouterResult> {
    const run = await prisma.ultraplanControllerRun.findFirst({
      where: {
        organizationId: event.organizationId,
        sessionId,
      },
      select: { id: true, ultraplanId: true, status: true, summary: true, summaryTitle: true },
      orderBy: { createdAt: "desc" },
    });
    if (!run) {
      return { handled: false, reason: "controller_run_not_found" };
    }
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return {
        handled: true,
        reason: "controller_run_already_terminal",
        ultraplanId: run.ultraplanId,
        controllerRunId: run.id,
      };
    }

    const summary = stringValue(run.summary) ?? stringValue(run.summaryTitle);
    if (summary) {
      return {
        handled: true,
        reason: "controller_run_has_summary",
        ultraplanId: run.ultraplanId,
        controllerRunId: run.id,
      };
    }

    await ultraplanControllerRunService.failRun(
      run.id,
      `Controller session ${status} without a valid completion summary`,
      "system",
      "system",
    );

    return {
      handled: true,
      reason: "controller_run_failed_missing_summary",
      ultraplanId: run.ultraplanId,
      controllerRunId: run.id,
    };
  }

  private async handleInboxGateResolution(event: AgentEvent): Promise<UltraplanEventRouterResult> {
    const inboxItem = readInboxItem(event.payload.inboxItem);
    if (!inboxItem) {
      return { handled: false, reason: "inbox_item_missing" };
    }
    if (inboxItem.sourceType !== "ultraplan" && inboxItem.sourceType !== "ticket_execution") {
      return { handled: false, reason: "not_ultraplan_gate" };
    }

    const payloadUltraplanId = stringValue(inboxItem.payload.ultraplanId);
    const payloadSessionGroupId = stringValue(inboxItem.payload.sessionGroupId);
    let target: { ultraplanId: string; sessionGroupId: string } | null = null;
    if (payloadUltraplanId && payloadSessionGroupId) {
      target = { ultraplanId: payloadUltraplanId, sessionGroupId: payloadSessionGroupId };
    } else if (inboxItem.sourceType === "ultraplan") {
      const ultraplan = await prisma.ultraplan.findFirst({
        where: { id: inboxItem.sourceId, organizationId: event.organizationId },
        select: { id: true, sessionGroupId: true },
      });
      target = ultraplan
        ? { ultraplanId: ultraplan.id, sessionGroupId: ultraplan.sessionGroupId }
        : null;
    } else {
      const execution = await prisma.ticketExecution.findFirst({
        where: { id: inboxItem.sourceId, organizationId: event.organizationId },
        select: { ultraplanId: true, sessionGroupId: true },
      });
      target = execution
        ? { ultraplanId: execution.ultraplanId, sessionGroupId: execution.sessionGroupId }
        : null;
    }
    if (!target) {
      return { handled: false, reason: "ultraplan_gate_target_not_found" };
    }

    return this.withSessionGroupLock(target.sessionGroupId, () =>
      this.wakeControllerForGate(event, target.ultraplanId, inboxItem),
    );
  }

  private async wakeControllerForGate(
    event: AgentEvent,
    ultraplanId: string,
    inboxItem: InboxItemSnapshot,
  ): Promise<UltraplanEventRouterResult> {
    const existingRun = await prisma.ultraplanControllerRun.findFirst({
      where: {
        organizationId: event.organizationId,
        triggerEventId: event.id,
      },
      select: { id: true, ultraplanId: true },
    });
    if (existingRun) {
      return {
        handled: true,
        reason: "duplicate_trigger",
        ultraplanId: existingRun.ultraplanId,
        controllerRunId: existingRun.id,
      };
    }

    const ultraplan = await prisma.ultraplan.findFirst({
      where: { id: ultraplanId, organizationId: event.organizationId },
      select: { id: true, status: true },
    });
    if (!ultraplan) {
      return { handled: false, reason: "ultraplan_not_found" };
    }
    if (["completed", "failed", "cancelled", "paused"].includes(ultraplan.status)) {
      return { handled: false, reason: "inactive_ultraplan" };
    }

    const resolution = stringValue(event.payload.resolution) ?? "resolved";
    const run = await ultraplanService.runControllerForEvent({
      id: ultraplan.id,
      actorType: "system",
      actorId: "system",
      triggerEventId: event.id,
      triggerType: "ultraplan_gate_resolved",
      inputSummary: `Human gate ${resolution}: ${inboxItem.title}`,
    });

    return {
      handled: true,
      reason: "gate_resolution_woke_controller",
      ultraplanId: ultraplan.id,
      controllerRunId: run.id,
    };
  }
}

export const ultraplanEventRouter = new UltraplanEventRouter();

type InboxItemSnapshot = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  payload: Record<string, unknown>;
};

function readInboxItem(raw: unknown): InboxItemSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.sourceType !== "string" ||
    typeof item.sourceId !== "string" ||
    typeof item.title !== "string"
  ) {
    return null;
  }
  const payload =
    item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? (item.payload as Record<string, unknown>)
      : {};
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    payload,
  };
}
