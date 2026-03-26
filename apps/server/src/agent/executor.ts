/**
 * Action Executor — the only place where the agent runtime mutates product state.
 *
 * Takes a planned action (name + args), looks it up in the action registry,
 * injects agent identity, and calls the corresponding service method.
 * Never writes to the DB directly — everything flows through the service layer.
 */

import type { ActorType, EntityType } from "@trace/gql";
import type { StartSessionServiceInput, SessionService } from "../services/session.js";
import type { ChatService } from "../services/chat.js";
import type { ChannelService } from "../services/channel.js";
import type { InboxService } from "../services/inbox.js";
import type { CreateTicketServiceInput, TicketService } from "../services/ticket.js";
import { findAction, validateActionParams } from "./action-registry.js";
import { redis } from "../lib/redis.js";

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
  channelService: ChannelService;
  sessionService: SessionService;
  inboxService: InboxService;
  /** Forward reference — created in ticket #09 (Entity Summaries). */
  summaryService?: { upsert(input: Record<string, unknown>): Promise<unknown> };
}

// ---------------------------------------------------------------------------
// Idempotency store
// ---------------------------------------------------------------------------

const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Pluggable idempotency store. The default in-memory implementation works for
 * single-process development. Swap for a Redis-backed implementation in
 * production (ticket #15 pipeline integration).
 */
export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  set(key: string): Promise<void>;
}

/**
 * In-memory idempotency store with TTL — suitable for development and tests.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private keys = new Map<string, number>();

  async has(key: string): Promise<boolean> {
    const ts = this.keys.get(key);
    if (ts === undefined) return false;
    if (Date.now() - ts > IDEMPOTENCY_TTL_MS) {
      this.keys.delete(key);
      return false;
    }
    return true;
  }

  async set(key: string): Promise<void> {
    this.keys.set(key, Date.now());

    // Lazy cleanup when the map gets large
    if (this.keys.size > 10_000) {
      const now = Date.now();
      for (const [k, ts] of this.keys) {
        if (now - ts > IDEMPOTENCY_TTL_MS) this.keys.delete(k);
      }
    }
  }
}

/**
 * Redis-backed idempotency store — survives worker restarts.
 * Keys are stored with automatic TTL expiry so no cleanup is needed.
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  private prefix: string;

  constructor(prefix = "agent:idempotency") {
    this.prefix = prefix;
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await redis.exists(`${this.prefix}:${key}`);
      return exists === 1;
    } catch {
      // If Redis is unavailable, allow the action through rather than blocking
      return false;
    }
  }

  async set(key: string): Promise<void> {
    try {
      const ttlSeconds = Math.ceil(IDEMPOTENCY_TTL_MS / 1000);
      await redis.set(`${this.prefix}:${key}`, "1", "EX", ttlSeconds);
    } catch {
      // Non-fatal — worst case we might execute a duplicate on restart
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple string hash for idempotency key differentiation (not cryptographic). */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export class ActionExecutor {
  private idempotency: IdempotencyStore;

  constructor(
    private services: ServiceContainer,
    idempotency?: IdempotencyStore,
  ) {
    this.idempotency = idempotency ?? new RedisIdempotencyStore();
  }

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
    // Include a hash of the args so that two different actions of the same type
    // on the same trigger event are not incorrectly deduplicated.
    const argsHash = simpleHash(JSON.stringify(args));
    const idempotencyKey = `agent:${ctx.agentId}:${actionType}:${ctx.triggerEventId}:${argsHash}`;
    if (await this.idempotency.has(idempotencyKey)) {
      return {
        status: "success",
        actionType,
        result: "duplicate — already executed for this trigger event",
      };
    }

    // ---- Execute ----
    try {
      const result = await this.dispatch(registration.service, registration.method, args, ctx);
      await this.idempotency.set(idempotencyKey);
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
              organizationId: orgId,
              title: args.title as string,
              description: args.description as string | undefined,
              priority: args.priority as CreateTicketServiceInput["priority"],
              labels: args.labels as string[] | undefined,
              channelId: args.channelId as string | undefined,
              projectId: args.projectId as string | undefined,
              assigneeIds: args.assigneeIds as string[] | undefined,
              actorType,
              actorId,
            });

          case "update": {
            const { id, ...input } = args;
            return svc.update(id as string, input, actorType, actorId);
          }

          case "addComment":
            return svc.addComment(
              args.ticketId as string,
              args.text as string,
              actorType,
              actorId,
            );

          case "link":
            return svc.link({
              ticketId: args.ticketId as string,
              entityType: args.entityType as EntityType,
              entityId: args.entityId as string,
              actorType,
              actorId,
            });

          case "searchByRelevance": {
            const limit = Math.min(typeof args.limit === "number" ? args.limit : 5, 10);
            return svc.searchByRelevance({
              organizationId: orgId,
              query: args.query as string,
              limit,
            });
          }

          case "getById":
            return svc.getById(orgId, args.ticketId as string);

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
              tool: (args.tool as StartSessionServiceInput["tool"] | undefined) ?? "claude_code",
              model: args.model as string | undefined,
              hosting: args.hosting as StartSessionServiceInput["hosting"],
              repoId: args.repoId as string | undefined,
              branch: args.branch as string | undefined,
              channelId: args.channelId as string | undefined,
              sessionGroupId: args.sessionGroupId as string | undefined,
              sourceSessionId: args.sourceSessionId as string | undefined,
              projectId: args.projectId as string | undefined,
              prompt: args.prompt as string | undefined,
              organizationId: orgId,
              createdById: actorId,
            });

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
              itemType: (args.itemType as Parameters<typeof svc.createItem>[0]["itemType"]) ?? "agent_escalation",
              title: args.title as string,
              summary: args.summary as string | undefined,
              payload: args.payload as Parameters<typeof svc.createItem>[0]["payload"],
              sourceType: args.sourceType as string,
              sourceId: args.sourceId as string,
            });

          case "listAgentSuggestions": {
            const limit = Math.min(typeof args.limit === "number" ? args.limit : 10, 25);
            return svc.listAgentSuggestions(orgId, {
              status: args.status as "active" | "resolved" | undefined,
              limit,
            });
          }

          default:
            throw new Error(`Unknown inboxService method: ${method}`);
        }
      }

      // ---- channelService (ticket #21 — channel message adapter) ----
      case "channelService": {
        const svc = this.services.channelService;
        switch (method) {
          case "sendMessage":
            return svc.sendMessage(
              args.channelId as string,
              args.text as string,
              (args.threadId as string | undefined) ?? null,
              actorType,
              actorId,
            );

          default:
            throw new Error(`Unknown channelService method: ${method}`);
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
