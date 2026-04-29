import type { ActorType, CreateTicketInput, InboxItemType, UpdateTicketInput } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import {
  type ControllerRuntimeActionName,
  validateControllerRuntimeActionRequest,
} from "./ultraplan-controller-contract.js";
import { ticketService } from "./ticket.js";
import { ultraplanControllerRunService } from "./ultraplan-controller-run.js";
import { ultraplanService } from "./ultraplan.js";

export type ExecuteUltraplanRuntimeActionInput = {
  organizationId: string;
  ultraplanId: string;
  controllerRunId: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  json: unknown;
};

export type UltraplanRuntimeActionResult =
  | {
      status: "success";
      action: ControllerRuntimeActionName;
      result: unknown;
    }
  | {
      status: "error";
      action: string;
      error: string;
    };

type ControllerRunScope = {
  id: string;
  organizationId: string;
  ultraplanId: string;
  sessionId: string | null;
  ultraplan: { sessionGroupId: string };
};

export class UltraplanRuntimeActionService {
  async execute(
    input: ExecuteUltraplanRuntimeActionInput,
  ): Promise<UltraplanRuntimeActionResult> {
    try {
      const request = validateControllerRuntimeActionRequest({
        action: input.action,
        json: input.json,
      });
      const run = await this.getAuthorizedRun(input);
      return {
        status: "success",
        action: request.action,
        result: await this.dispatch(request.action, request.json, input, run),
      };
    } catch (error) {
      return {
        status: "error",
        action: input.action,
        error: error instanceof Error ? error.message : "Runtime action failed",
      };
    }
  }

  private async getAuthorizedRun(input: ExecuteUltraplanRuntimeActionInput) {
    const run = await prisma.ultraplanControllerRun.findUniqueOrThrow({
      where: { id: input.controllerRunId },
      select: {
        id: true,
        organizationId: true,
        ultraplanId: true,
        sessionId: true,
        ultraplan: { select: { sessionGroupId: true } },
      },
    });
    if (run.organizationId !== input.organizationId || run.ultraplanId !== input.ultraplanId) {
      throw new Error("Runtime action scope does not match controller run");
    }
    await prisma.$transaction((tx) =>
      assertActorOrgAccess(tx, run.organizationId, input.actorType, input.actorId),
    );
    return run;
  }

  private dispatch(
    action: ControllerRuntimeActionName,
    json: Record<string, unknown>,
    input: ExecuteUltraplanRuntimeActionInput,
    run: ControllerRunScope,
  ) {
    switch (action) {
      case "ticket.create":
        return ticketService.create({
          organizationId: input.organizationId,
          title: requiredString(json.title, "title"),
          description: optionalString(json.description, "description"),
          priority: optionalString(json.priority, "priority") as CreateTicketInput["priority"],
          labels: optionalStringArray(json.labels, "labels"),
          channelId: optionalString(json.channelId, "channelId"),
          projectId: optionalString(json.projectId, "projectId"),
          assigneeIds: optionalStringArray(json.assigneeIds, "assigneeIds"),
          acceptanceCriteria: optionalStringArray(json.acceptanceCriteria, "acceptanceCriteria"),
          testPlan: optionalString(json.testPlan, "testPlan"),
          dependencyTicketIds: optionalStringArray(json.dependencyTicketIds, "dependencyTicketIds"),
          actorType: input.actorType,
          actorId: input.actorId,
        });
      case "ticket.update":
        return ticketService.update(
          requiredString(json.id ?? json.ticketId, "ticketId"),
          ticketUpdateInput(json),
          input.actorType,
          input.actorId,
        );
      case "ticket.addComment":
        return ticketService.addComment(
          requiredString(json.ticketId, "ticketId"),
          requiredString(json.text, "text"),
          input.actorType,
          input.actorId,
        );
      case "ticket.updateAcceptanceCriteria":
        return ticketService.update(
          requiredString(json.ticketId ?? json.id, "ticketId"),
          { acceptanceCriteria: requiredStringArray(json.acceptanceCriteria, "acceptanceCriteria") },
          input.actorType,
          input.actorId,
        );
      case "ticket.updateTestPlan":
        return ticketService.update(
          requiredString(json.ticketId ?? json.id, "ticketId"),
          { testPlan: requiredString(json.testPlan, "testPlan") },
          input.actorType,
          input.actorId,
        );
      case "ticket.addDependency":
        return ticketService.update(
          requiredString(json.ticketId ?? json.id, "ticketId"),
          { dependencyTicketIds: dependencyTicketIds(json) },
          input.actorType,
          input.actorId,
        );
      case "ultraplan.requestHumanGate":
        return ultraplanService.requestHumanGate({
          organizationId: input.organizationId,
          ultraplanId: input.ultraplanId,
          actorType: input.actorType,
          actorId: input.actorId,
          itemType: requiredString(json.itemType, "itemType") as InboxItemType,
          title: requiredString(json.title, "title"),
          summary: optionalString(json.summary, "summary"),
          gateReason: optionalString(json.gateReason, "gateReason"),
          payload: optionalRecord(json.payload, "payload"),
          controllerRunId: input.controllerRunId,
          controllerRunSessionId: run.sessionId,
          ticketId: optionalString(json.ticketId, "ticketId"),
          ticketExecutionId: optionalString(json.ticketExecutionId, "ticketExecutionId"),
          workerSessionId: optionalString(json.workerSessionId, "workerSessionId"),
          branchName: optionalString(json.branchName, "branchName"),
          checkpointSha: optionalString(json.checkpointSha, "checkpointSha"),
          recommendedAction: optionalString(json.recommendedAction, "recommendedAction"),
          qaChecklist: optionalStringArray(json.qaChecklist, "qaChecklist"),
          controllerRunUrl: optionalString(json.controllerRunUrl, "controllerRunUrl"),
          workerSessionUrl: optionalString(json.workerSessionUrl, "workerSessionUrl"),
          diffUrl: optionalString(json.diffUrl, "diffUrl"),
          prUrl: optionalString(json.prUrl, "prUrl"),
        });
      case "ultraplan.completeControllerRun":
        return ultraplanControllerRunService.completeRun(
          input.controllerRunId,
          {
            summaryTitle: optionalString(json.summaryTitle, "summaryTitle"),
            summary: optionalString(json.summary, "summary"),
            summaryPayload: json.summaryPayload ?? json,
          },
          input.actorType,
          input.actorId,
        );
      default:
        throw new Error(`Runtime action "${action}" is not implemented yet`);
    }
  }
}

function ticketUpdateInput(json: Record<string, unknown>): UpdateTicketInput {
  return {
    title: optionalString(json.title, "title"),
    description: optionalString(json.description, "description"),
    status: optionalString(json.status, "status") as UpdateTicketInput["status"],
    priority: optionalString(json.priority, "priority") as UpdateTicketInput["priority"],
    labels: optionalStringArray(json.labels, "labels"),
    acceptanceCriteria: optionalStringArray(json.acceptanceCriteria, "acceptanceCriteria"),
    testPlan: optionalString(json.testPlan, "testPlan"),
    dependencyTicketIds: optionalStringArray(json.dependencyTicketIds, "dependencyTicketIds"),
  };
}

function dependencyTicketIds(json: Record<string, unknown>): string[] {
  const ids = optionalStringArray(json.dependencyTicketIds, "dependencyTicketIds");
  if (ids) return ids;
  return [requiredString(json.dependsOnTicketId, "dependsOnTicketId")];
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, path);
}

function requiredStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value.map((item, index) => requiredString(item, `${path}[${index}]`));
}

function optionalStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredStringArray(value, path);
}

function optionalRecord(value: unknown, path: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

export const ultraplanRuntimeActionService = new UltraplanRuntimeActionService();
