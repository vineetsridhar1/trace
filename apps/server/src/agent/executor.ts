/**
 * Action Executor — the only place where the agent runtime mutates product state.
 *
 * Takes a planned action (name + args), looks it up in the action registry,
 * injects agent identity, and calls the corresponding service method.
 * Never writes to the DB directly — everything flows through the service layer.
 */

import type { ActorType, EntityType } from "@trace/gql";
import type { TicketService } from "../services/ticket.js";
import type { ChatService } from "../services/chat.js";
import type { SessionService } from "../services/session.js";
import type { InboxService } from "../services/inbox.js";
import { findAction, validateActionParams } from "./action-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannedAction {
  actionType: string;
  args: Record<string, unknown>;
}

export interface AgentContext {
  organizationId: string;
  agentId: string;
  /** The event that triggered this action — used for idempotency. */
  triggerEventId: string;
}

export interface ExecutionResult {
  status: "success" | "failed";
  actionType: string;
  result?: unknown;
  error?: string;
}

/**
 * Service container — dependency-injected so the executor calls the same
 * service instances the API server uses.
 */
export interface ServiceContainer {
  ticketService: TicketService;
  chatService: ChatService;
  sessionService: SessionService;
  inboxService: InboxService;
  /** Forward reference — created in ticket #09 (Entity Summaries). */
  summaryService?: { upsert(input: Record<string, unknown>): Promise<unknown> };
}

// ---------------------------------------------------------------------------
// Idempotency store
// ---------------------------------------------------------------------------

/**
 * Simple in-memory idempotency store with TTL.
 * Can be swapped for Redis in production.
 */
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour

const usedKeys = new Map<string, number>();

function buildIdempotencyKey(ctx: AgentContext, actionName: string): string {
  return `agent:${ctx.agentId}:${actionName}:${ctx.triggerEventId}`;
}

function hasBeenExecuted(key: string): boolean {
  const ts = usedKeys.get(key);
  if (ts === undefined) return false;
  if (Date.now() - ts > IDEMPOTENCY_TTL_MS) {
    usedKeys.delete(key);
    return false;
  }
  return true;
}

function markExecuted(key: string): void {
  usedKeys.set(key, Date.now());

  // Lazy cleanup: prune expired keys when the map gets large
  if (usedKeys.size > 10_000) {
    const now = Date.now();
    for (const [k, ts] of usedKeys) {
      if (now - ts > IDEMPOTENCY_TTL_MS) usedKeys.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export class ActionExecutor {
  constructor(private services: ServiceContainer) {}

  async execute(action: PlannedAction, ctx: AgentContext): Promise<ExecutionResult> {
    const { actionType, args } = action;

    // ---- no_op: return immediately, no side effects ----
    if (actionType === "no_op") {
      return { status: "success", actionType };
    }

    // ---- Resolve from registry ----
    const registration = findAction(actionType);
    if (!registration) {
      return {
        status: "failed",
        actionType,
        error: `Unknown action: ${actionType}`,
      };
    }

    // ---- Validate parameters ----
    const validation = validateActionParams(registration, args);
    if (!validation.valid) {
      return {
        status: "failed",
        actionType,
        error: `Invalid parameters: ${validation.errors.join("; ")}`,
      };
    }

    // ---- Idempotency check ----
    const idempotencyKey = buildIdempotencyKey(ctx, actionType);
    if (hasBeenExecuted(idempotencyKey)) {
      return {
        status: "success",
        actionType,
        result: "duplicate — already executed for this trigger event",
      };
    }

    // ---- Execute ----
    try {
      const result = await this.dispatch(registration.service, registration.method, args, ctx);
      markExecuted(idempotencyKey);
      return { status: "success", actionType, result };
    } catch (err) {
      return {
        status: "failed",
        actionType,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Dispatch — maps registry entries to actual service calls
  // ---------------------------------------------------------------------------

  private async dispatch(
    serviceName: string,
    method: string,
    args: Record<string, unknown>,
    ctx: AgentContext,
  ): Promise<unknown> {
    const actorType: ActorType = "agent";
    const actorId = ctx.agentId;
    const orgId = ctx.organizationId;

    switch (serviceName) {
      // ---- ticketService ----
      case "ticketService": {
        const svc = this.services.ticketService;
        switch (method) {
          case "create":
            return svc.create({
              ...args,
              organizationId: orgId,
              actorType,
              actorId,
            } as Parameters<typeof svc.create>[0]);

          case "update": {
            const { id, ...input } = args;
            return svc.update(id as string, input, actorType, actorId);
          }

          case "addComment": {
            const { ticketId, text } = args as { ticketId: string; text: string };
            return svc.addComment(ticketId, text, actorType, actorId);
          }

          case "link": {
            const { ticketId, entityType, entityId } = args as {
              ticketId: string;
              entityType: EntityType;
              entityId: string;
            };
            return svc.link({ ticketId, entityType, entityId, actorType, actorId });
          }

          default:
            throw new Error(`Unknown ticketService method: ${method}`);
        }
      }

      // ---- chatService ----
      case "chatService": {
        const svc = this.services.chatService;
        switch (method) {
          case "sendMessage":
            return svc.sendMessage({
              chatId: args.chatId as string,
              organizationId: orgId,
              text: args.text as string | undefined,
              html: args.html as string | undefined,
              parentId: args.parentId as string | undefined,
              actorType,
              actorId,
            });

          default:
            throw new Error(`Unknown chatService method: ${method}`);
        }
      }

      // ---- sessionService ----
      case "sessionService": {
        const svc = this.services.sessionService;
        switch (method) {
          case "start":
            return svc.start({
              ...args,
              organizationId: orgId,
              createdById: actorId,
            } as Parameters<typeof svc.start>[0]);

          case "pause":
            return svc.pause(args.id as string, actorType, actorId);

          case "resume":
            return svc.resume(args.id as string, actorType, actorId);

          default:
            throw new Error(`Unknown sessionService method: ${method}`);
        }
      }

      // ---- inboxService ----
      case "inboxService": {
        const svc = this.services.inboxService;
        switch (method) {
          case "createItem":
            return svc.createItem({
              orgId,
              userId: args.userId as string,
              itemType: "agent_escalation" as Parameters<typeof svc.createItem>[0]["itemType"],
              title: args.title as string,
              summary: args.summary as string | undefined,
              sourceType: args.sourceType as string,
              sourceId: args.sourceId as string,
            });

          default:
            throw new Error(`Unknown inboxService method: ${method}`);
        }
      }

      // ---- summaryService (forward reference — ticket #09) ----
      case "summaryService": {
        const svc = this.services.summaryService;
        if (!svc) {
          throw new Error("summaryService is not yet available (see ticket #09)");
        }
        switch (method) {
          case "upsert":
            return svc.upsert({
              entityType: args.entityType,
              entityId: args.entityId,
              summary: args.summary,
              organizationId: orgId,
              actorType,
              actorId,
            });

          default:
            throw new Error(`Unknown summaryService method: ${method}`);
        }
      }

      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }
}
