/**
 * Shared types for the tiered action system.
 *
 * ActionDispatcher — function signature for executing an action via service layer.
 * AgentActionRegistration — extended with `tier` for two-tier prompt rendering.
 */

import type { ActorType, EntityType } from "@trace/gql";
import type { TicketService, CreateTicketServiceInput } from "../../services/ticket.js";
import type { ChatService } from "../../services/chat.js";
import type { ChannelService } from "../../services/channel.js";
import type { SessionService, StartSessionServiceInput } from "../../services/session.js";
import type { InboxService } from "../../services/inbox.js";
import type { OrganizationService } from "../../services/organization.js";
import type { EventService } from "../../services/event.js";
import type { MemoryService } from "../../services/memory.js";

// ---------------------------------------------------------------------------
// Risk, scope, and parameter types (moved from action-registry.ts)
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "medium" | "high";

export type ScopeType = "chat" | "channel" | "ticket" | "session" | "project" | "system";

export interface ParameterField {
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string };
}

export interface ParameterSchema {
  fields: Record<string, ParameterField>;
}

// ---------------------------------------------------------------------------
// Action registration — extended with tier + catalogDescription
// ---------------------------------------------------------------------------

export interface AgentActionRegistration {
  name: string;
  service: string;
  method: string;
  description: string;
  /** One-line description with verb synonyms + param hints for extended catalog. */
  catalogDescription?: string;
  risk: RiskLevel;
  suggestable: boolean;
  parameters: ParameterSchema;
  scopes: ScopeType[];
  /** "core" = full schema in prompt; "extended" = one-line catalog entry. */
  tier: "core" | "extended";
  requiredPermissions?: string[];
}

// ---------------------------------------------------------------------------
// Service container — dependency-injected services for dispatchers
// ---------------------------------------------------------------------------

export interface ServiceContainer {
  ticketService: TicketService;
  chatService: ChatService;
  channelService: ChannelService;
  sessionService: SessionService;
  inboxService: InboxService;
  organizationService: OrganizationService;
  eventService: EventService;
  /** Forward reference — created in ticket #09 (Entity Summaries). */
  summaryService?: { upsert(input: Record<string, unknown>): Promise<unknown> };
  /** Memory service for searching derived memories. */
  memoryService?: MemoryService;
}

// ---------------------------------------------------------------------------
// Agent context — passed to every dispatcher
// ---------------------------------------------------------------------------

export interface AgentContext {
  organizationId: string;
  agentId: string;
  /** The event that triggered this action — used for idempotency. */
  triggerEventId: string;
  /** Scope context for privacy-aware actions like memory.search. */
  scopeType?: string;
  scopeId?: string;
  isDm?: boolean;
}

// ---------------------------------------------------------------------------
// Action dispatcher — function that executes an action via the service layer
// ---------------------------------------------------------------------------

export type ActionDispatcher = (
  services: ServiceContainer,
  args: Record<string, unknown>,
  ctx: AgentContext,
) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Helpers — commonly used by dispatchers
// ---------------------------------------------------------------------------

export const EMPTY_PARAMS: ParameterSchema = { fields: {} };

export function actorInfo(ctx: AgentContext): { actorType: ActorType; actorId: string } {
  return { actorType: "agent" as ActorType, actorId: ctx.agentId };
}

// Re-export service input types used by dispatchers
export type { CreateTicketServiceInput, StartSessionServiceInput, EntityType };
