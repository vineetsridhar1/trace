/**
 * Context Builder — converts an aggregated event batch into a compact, relevant
 * context packet for the planner.
 *
 * The planner is only as good as what this module feeds it. This is a retrieval
 * step, not a data dump — we search for relevant entities rather than loading everything.
 *
 * Ticket: #10
 */

import { prisma } from "../lib/db.js";
import { ScopeType as PrismaScopeType } from "@prisma/client";
import { summaryService } from "../services/summary.js";
import { refreshIfStale } from "./summary-worker.js";
import { ticketService } from "../services/ticket.js";
import {
  getActionsByScope,
  type AgentActionRegistration,
  type ScopeType,
} from "./action-registry.js";
import type { AggregatedBatch } from "./aggregator.js";
import type { AgentEvent } from "./router.js";
import type { OrgAgentSettings } from "../services/agent-identity.js";
import { resolveSoulFile } from "./soul-file-resolver.js";
import { resolveAutonomyMode, type AutonomyScopeType } from "../services/scope-autonomy.js";
import { memoryService } from "../services/memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compact representation of an entity included in the context packet. */
export interface ContextEntity {
  type: string;
  id: string;
  data: Record<string, unknown>;
  hop: number; // 0 = scope entity, 1 = directly linked, 2 = linked-to-linked
}

/** Freshness metadata for a summary included in the packet. */
export interface ContextSummary {
  entityType: string;
  entityId: string;
  content: string;
  structuredData: Record<string, unknown>;
  fresh: boolean;
  eventCount: number;
}

/** A derived memory included in the context packet. */
export interface ContextMemory {
  kind: string;
  subjectType: string;
  subjectId: string;
  content: string;
  confidence: number;
}

/** Canonical decision-oriented facts derived from noisy raw context. */
export interface DecisionContext {
  triggerType: string;
  scopeType: string;
  autonomyMode: string;
  isMention: boolean;
  canonicalState: string[];
  constraints: string[];
}

/** Compact event adapter for planner-friendly recent context. */
export interface RecentSignal {
  timestamp: string;
  actor: string;
  kind: string;
  text: string;
  sourceEventId: string;
}

/** Compact entity rendering for scope + relevant entities. */
export interface EntitySnapshot {
  type: string;
  id: string;
  label: string;
  facts: string[];
}

/** Actor information resolved from user IDs in the batch. */
export interface ContextActor {
  id: string;
  name: string;
  role: string;
  type: string; // "user" | "agent"
}

/** The structured context packet passed to the planner. */
export interface AgentContextPacket {
  organizationId: string;
  scopeKey: string;
  scopeType: string;
  scopeId: string;

  /** Whether this scope is a DM (direct message) chat. */
  isDm: boolean;

  /** Whether the trigger event is an @mention of the agent. */
  isMention: boolean;

  /** The most recent event in the batch — the primary trigger. */
  triggerEvent: AgentEvent;

  /** All events in the aggregation window. */
  eventBatch: AgentEvent[];

  /** Org-level agent personality / instructions. */
  soulFile: string;

  /** The entity where the event happened (chat, ticket, session). */
  scopeEntity: ContextEntity | null;

  /** Entities found via targeted search and link traversal. */
  relevantEntities: ContextEntity[];

  /** Canonical decision-oriented facts derived from the current context. */
  decisionContext: DecisionContext;

  /** Compact snapshots for the scope entity and nearby relevant entities. */
  entitySnapshots: EntitySnapshot[];

  /** Additional recent events in the same scope beyond the batch. */
  recentEvents: AgentEvent[];

  /** Rolling summaries for the scope and relevant entities. */
  summaries: ContextSummary[];

  /** Derived memories relevant to this context. */
  memories: ContextMemory[];

  /** Normalized high-signal events for planner reasoning. */
  recentSignals: RecentSignal[];

  /** Actors involved in the batch events. */
  actors: ContextActor[];

  /** Org autonomy mode and available actions filtered by scope. */
  permissions: {
    autonomyMode: string;
    actions: AgentActionRegistration[];
  };

  /** Token budget accounting — how many estimated tokens each section uses. */
  tokenBudget: {
    total: number;
    used: number;
    sections: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// Token budget configuration
// ---------------------------------------------------------------------------

/** Simple token estimation: words × 1.3 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

function estimateObjectTokens(obj: unknown): number {
  return estimateTokens(JSON.stringify(obj));
}

/**
 * Per-section token allocations. These define the maximum tokens each section
 * can consume. Sections are filled greedily by priority order.
 */
export interface TokenBudgetConfig {
  total: number;
  sections: {
    triggerEvent: number;
    actionSchema: number;
    soulFile: number;
    scopeEntity: number;
    eventBatch: number;
    relevantEntities: number;
    decisionContext: number;
    entitySnapshots: number;
    summaries: number;
    memories: number;
    recentEvents: number;
    recentSignals: number;
    actors: number;
  };
}

/** Tier 2 token budget — ~30% of 200K context window */
export const TIER2_TOKEN_BUDGET: TokenBudgetConfig = {
  total: 60_000,
  sections: {
    triggerEvent: 1_500,
    actionSchema: 4_000,
    soulFile: 2_000,
    scopeEntity: 3_000,
    eventBatch: 6_000,
    relevantEntities: 8_000,
    decisionContext: 2_000,
    entitySnapshots: 4_000,
    summaries: 8_000,
    memories: 4_000,
    recentEvents: 4_000,
    recentSignals: 3_500,
    actors: 1_500,
  },
};

/** Tier 3 token budget — larger budget for premium model (Opus-class) */
export const TIER3_TOKEN_BUDGET: TokenBudgetConfig = {
  total: 100_000,
  sections: {
    triggerEvent: 2_000,
    actionSchema: 5_000,
    soulFile: 3_000,
    scopeEntity: 5_000,
    eventBatch: 10_000,
    relevantEntities: 14_000,
    decisionContext: 2_500,
    entitySnapshots: 5_000,
    summaries: 16_000,
    memories: 8_000,
    recentEvents: 6_000,
    recentSignals: 4_000,
    actors: 3_000,
  },
};

const DEFAULT_TOKEN_BUDGET = TIER2_TOKEN_BUDGET;

// ---------------------------------------------------------------------------
// Scope entity fetching — strategy per scope type
// ---------------------------------------------------------------------------

type ScopeEntityFetcher = (
  organizationId: string,
  scopeId: string,
) => Promise<Record<string, unknown> | null>;

const scopeFetchers: Record<string, ScopeEntityFetcher> = {
  async chat(organizationId, scopeId) {
    const chat = await prisma.chat.findUnique({
      where: { id: scopeId },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!chat) return null;
    return {
      id: chat.id,
      type: chat.type,
      name: chat.name,
      aiMode: chat.aiMode,
      memberCount: chat.members.length,
      members: chat.members.map((m: { user: { id: string; name: string | null } }) => ({
        id: m.user.id,
        name: m.user.name,
      })),
    };
  },

  async ticket(organizationId, scopeId) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: scopeId },
      include: {
        assignees: { include: { user: { select: { id: true, name: true } } } },
        links: true,
        projects: { include: { project: { select: { id: true, name: true } } } },
        channel: { select: { id: true, name: true } },
      },
    });
    if (!ticket) return null;
    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      labels: ticket.labels,
      aiMode: ticket.aiMode,
      assignees: ticket.assignees.map((a: { user: { id: string; name: string | null } }) => ({
        id: a.user.id,
        name: a.user.name,
      })),
      links: ticket.links.map((l: { entityType: string; entityId: string }) => ({
        entityType: l.entityType,
        entityId: l.entityId,
      })),
      projects: ticket.projects.map((p: { project: { id: string; name: string } }) => ({
        id: p.project.id,
        name: p.project.name,
      })),
      channel: ticket.channel ? { id: ticket.channel.id, name: ticket.channel.name } : null,
    };
  },

  async session(organizationId, scopeId) {
    const [session, linkedTicketLinks] = await Promise.all([
      prisma.session.findUnique({
        where: { id: scopeId },
        include: {
          repo: { select: { id: true, name: true, remoteUrl: true } },
          channel: { select: { id: true, name: true } },
          projects: { include: { project: { select: { id: true, name: true } } } },
        },
      }),
      // Reverse lookup: find tickets that link to this session
      prisma.ticketLink.findMany({
        where: { entityType: "session", entityId: scopeId },
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              assignees: { include: { user: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
    ]);
    if (!session) return null;

    const linkedTickets = linkedTicketLinks.map(
      (l: {
        ticket: {
          id: string;
          title: string;
          status: string;
          priority: string | null;
          assignees: Array<{ user: { id: string; name: string | null } }>;
        };
      }) => ({
        id: l.ticket.id,
        title: l.ticket.title,
        status: l.ticket.status,
        priority: l.ticket.priority,
        assignees: l.ticket.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
      }),
    );

    return {
      id: session.id,
      name: session.name,
      agentStatus: session.agentStatus,
      sessionStatus: session.sessionStatus,
      tool: session.tool,
      repo: session.repo
        ? { id: session.repo.id, name: session.repo.name, remoteUrl: session.repo.remoteUrl }
        : null,
      channel: session.channel ? { id: session.channel.id, name: session.channel.name } : null,
      projects: session.projects.map((p: { project: { id: string; name: string } }) => ({
        id: p.project.id,
        name: p.project.name,
      })),
      linkedTickets,
    };
  },

  async channel(organizationId, scopeId) {
    const channel = await prisma.channel.findUnique({
      where: { id: scopeId },
      include: {
        members: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true } } },
        },
        projects: { include: { project: { select: { id: true, name: true } } } },
        repo: { select: { id: true, name: true } },
      },
    });
    if (!channel) return null;
    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      aiMode: channel.aiMode,
      memberCount: channel.members.length,
      members: channel.members.map((m: { user: { id: string; name: string | null } }) => ({
        id: m.user.id,
        name: m.user.name,
      })),
      projects: channel.projects.map((p: { project: { id: string; name: string } }) => ({
        id: p.project.id,
        name: p.project.name,
      })),
      repo: channel.repo ? { id: channel.repo.id, name: channel.repo.name } : null,
    };
  },
};

async function fetchScopeEntity(
  scopeType: string,
  organizationId: string,
  scopeId: string,
): Promise<ContextEntity | null> {
  const fetcher = scopeFetchers[scopeType];
  if (!fetcher) {
    // Generic fallback — no specific fetcher for this scope type
    return null;
  }

  const data = await fetcher(organizationId, scopeId);
  if (!data) return null;

  return { type: scopeType, id: scopeId, data, hop: 0 };
}

// ---------------------------------------------------------------------------
// Relevant entity search
// ---------------------------------------------------------------------------

/**
 * Extract search text from a batch of events. Concatenates message text,
 * ticket titles, and other textual payload fields.
 */
function extractSearchText(events: AgentEvent[]): string {
  const parts: string[] = [];

  for (const event of events) {
    const p = event.payload;
    if (typeof p.text === "string") parts.push(p.text);
    if (typeof p.title === "string") parts.push(p.title);
    if (typeof p.description === "string") parts.push(p.description);
    if (typeof p.html === "string") {
      // Strip HTML tags for search
      parts.push(p.html.replace(/<[^>]+>/g, " "));
    }
  }

  return parts.join(" ").slice(0, 1000); // cap length for query sanity
}

/**
 * Find relevant entities via bounded graph traversal.
 * Uses batched DB queries to avoid N+1 problems.
 *
 * Hop 0: scope entity (already fetched separately)
 * Hop 1: directly linked entities + ticket search + reverse links
 * Hop 2: entities linked to Hop 1 tickets (capped at 3)
 */
async function findRelevantEntities(input: {
  organizationId: string;
  scopeType: string;
  scopeId: string;
  scopeEntity: ContextEntity | null;
  events: AgentEvent[];
  tokenBudget: number;
}): Promise<ContextEntity[]> {
  const entities: ContextEntity[] = [];
  const seen = new Set<string>(); // "type:id" dedup
  seen.add(`${input.scopeType}:${input.scopeId}`); // don't re-include scope

  // --- Ticket search by relevance (runs in parallel with link collection) ---
  const searchText = extractSearchText(input.events);
  const ticketSearchPromise = searchText.trim()
    ? ticketService
        .searchByRelevance({
          organizationId: input.organizationId,
          query: searchText,
          limit: 5,
        })
        .catch(
          () =>
            [] as Array<{
              id: string;
              title: string;
              description: string | null;
              status: string;
              priority: string | null;
              labels: string[];
            }>,
        )
    : Promise.resolve([]);

  // --- Collect all Hop 1 links that need fetching ---
  const hop1Links: Array<{ entityType: string; entityId: string }> = [];

  const scopeLinks = (input.scopeEntity?.data.links ?? []) as Array<{
    entityType: string;
    entityId: string;
  }>;
  for (const link of scopeLinks) {
    const key = `${link.entityType}:${link.entityId}`;
    if (!seen.has(key)) {
      seen.add(key);
      hop1Links.push(link);
    }
  }

  // Run ticket search and Hop 1 link fetch in parallel
  const [searchResults, hop1Fetched] = await Promise.all([
    ticketSearchPromise,
    batchFetchLinkedEntities(hop1Links),
  ]);

  // Add ticket search results
  for (const ticket of searchResults) {
    const key = `ticket:${ticket.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entities.push({
      type: "ticket",
      id: ticket.id,
      data: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description?.slice(0, 500),
        status: ticket.status,
        priority: ticket.priority,
        labels: ticket.labels,
      },
      hop: 1,
    });
  }

  // Add Hop 1 linked entities
  for (const link of hop1Links) {
    const key = `${link.entityType}:${link.entityId}`;
    const fetched = hop1Fetched.get(key);
    if (fetched) {
      entities.push({ ...fetched, hop: 1 });
    }
  }

  // --- Session-specific: include reverse-linked tickets (Hop 1) ---
  const linkedTickets = (input.scopeEntity?.data.linkedTickets ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    assignees: Array<{ id: string; name: string | null }>;
  }>;

  for (const ticket of linkedTickets) {
    const key = `ticket:${ticket.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entities.push({
      type: "ticket",
      id: ticket.id,
      data: ticket as unknown as Record<string, unknown>,
      hop: 1,
    });
  }

  // --- Follow links from Hop 1 ticket entities (Hop 2) ---
  // Batch-fetch all ticket links in one query, then batch-fetch the linked entities
  const hop1TicketIds = entities.filter((e) => e.type === "ticket" && e.hop === 1).map((e) => e.id);

  if (hop1TicketIds.length > 0) {
    const allTicketLinks = await prisma.ticketLink.findMany({
      where: { ticketId: { in: hop1TicketIds } },
    });

    // Collect unseen Hop 2 links (capped)
    const hop2Links: Array<{ entityType: string; entityId: string }> = [];
    for (const link of allTicketLinks) {
      if (hop2Links.length >= 3) break;
      const key = `${link.entityType}:${link.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hop2Links.push({ entityType: link.entityType, entityId: link.entityId });
    }

    if (hop2Links.length > 0) {
      const hop2Fetched = await batchFetchLinkedEntities(hop2Links);
      for (const link of hop2Links) {
        const key = `${link.entityType}:${link.entityId}`;
        const fetched = hop2Fetched.get(key);
        if (fetched) {
          entities.push({ ...fetched, hop: 2 });
        }
      }
    }
  }

  // --- Project/repo context (Hop 1 if scope belongs to a project) ---
  const scopeProjects = (input.scopeEntity?.data.projects ?? []) as Array<{
    id: string;
    name: string;
  }>;

  for (const proj of scopeProjects) {
    const key = `project:${proj.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entities.push({
      type: "project",
      id: proj.id,
      data: { id: proj.id, name: proj.name },
      hop: 1,
    });
  }

  // Repo context for sessions
  const scopeRepo = input.scopeEntity?.data.repo as
    | { id: string; name: string; remoteUrl: string }
    | null
    | undefined;

  if (scopeRepo) {
    const key = `repo:${scopeRepo.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({
        type: "repo",
        id: scopeRepo.id,
        data: scopeRepo,
        hop: 1,
      });
    }
  }

  // --- Truncate by token budget ---
  return truncateEntities(entities, input.tokenBudget);
}

/**
 * Batch-fetch linked entities by type. Groups IDs by entity type and executes
 * one `findMany` per type instead of N individual `findUnique` calls.
 *
 * Privacy guard (ticket #17): DM chats are never included as relevant
 * entities in non-DM context packets — their content must never leak.
 */
async function batchFetchLinkedEntities(
  links: Array<{ entityType: string; entityId: string }>,
): Promise<Map<string, Omit<ContextEntity, "hop">>> {
  const result = new Map<string, Omit<ContextEntity, "hop">>();
  if (links.length === 0) return result;

  // Group IDs by entity type
  const grouped = new Map<string, string[]>();
  for (const link of links) {
    const ids = grouped.get(link.entityType) ?? [];
    ids.push(link.entityId);
    grouped.set(link.entityType, ids);
  }

  // Execute batched queries in parallel
  const queries: Promise<void>[] = [];

  const sessionIds = grouped.get("session");
  if (sessionIds?.length) {
    queries.push(
      prisma.session
        .findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, name: true, agentStatus: true, sessionStatus: true, tool: true },
        })
        .then(
          (
            rows: Array<{
              id: string;
              name: string | null;
              agentStatus: string;
              sessionStatus: string;
              tool: string;
            }>,
          ) => {
            for (const s of rows) {
              result.set(`session:${s.id}`, {
                type: "session",
                id: s.id,
                data: {
                  id: s.id,
                  name: s.name,
                  agentStatus: s.agentStatus,
                  sessionStatus: s.sessionStatus,
                  tool: s.tool,
                },
              });
            }
          },
        )
        .catch(() => {}),
    );
  }

  const channelIds = grouped.get("channel");
  if (channelIds?.length) {
    queries.push(
      prisma.channel
        .findMany({
          where: { id: { in: channelIds } },
          select: { id: true, name: true, type: true },
        })
        .then((rows: Array<{ id: string; name: string; type: string }>) => {
          for (const c of rows) {
            result.set(`channel:${c.id}`, {
              type: "channel",
              id: c.id,
              data: { id: c.id, name: c.name, type: c.type },
            });
          }
        })
        .catch(() => {}),
    );
  }

  const chatIds = grouped.get("chat");
  if (chatIds?.length) {
    queries.push(
      prisma.chat
        .findMany({
          where: { id: { in: chatIds } },
          select: { id: true, name: true, type: true },
        })
        .then((rows: Array<{ id: string; name: string | null; type: string }>) => {
          for (const ch of rows) {
            // Privacy guard: never include DM chats as linked entities
            if (ch.type === "dm") continue;
            result.set(`chat:${ch.id}`, {
              type: "chat",
              id: ch.id,
              data: { id: ch.id, name: ch.name, type: ch.type },
            });
          }
        })
        .catch(() => {}),
    );
  }

  const ticketIds = grouped.get("ticket");
  if (ticketIds?.length) {
    queries.push(
      prisma.ticket
        .findMany({
          where: { id: { in: ticketIds } },
          select: { id: true, title: true, status: true, priority: true, labels: true },
        })
        .then(
          (
            rows: Array<{
              id: string;
              title: string;
              status: string;
              priority: string | null;
              labels: string[];
            }>,
          ) => {
            for (const t of rows) {
              result.set(`ticket:${t.id}`, {
                type: "ticket",
                id: t.id,
                data: {
                  id: t.id,
                  title: t.title,
                  status: t.status,
                  priority: t.priority,
                  labels: t.labels,
                },
              });
            }
          },
        )
        .catch(() => {}),
    );
  }

  const projectIds = grouped.get("project");
  if (projectIds?.length) {
    queries.push(
      prisma.project
        .findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
        .then((rows: Array<{ id: string; name: string }>) => {
          for (const p of rows) {
            result.set(`project:${p.id}`, {
              type: "project",
              id: p.id,
              data: { id: p.id, name: p.name },
            });
          }
        })
        .catch(() => {}),
    );
  }

  await Promise.all(queries);
  return result;
}

/** Truncate entities list to fit within a token budget, removing least relevant first. */
function truncateEntities(entities: ContextEntity[], budget: number): ContextEntity[] {
  // Sort by hop (lower = more relevant), then by order added
  const sorted = [...entities].sort((a, b) => a.hop - b.hop);
  const result: ContextEntity[] = [];
  let used = 0;

  for (const entity of sorted) {
    const tokens = estimateObjectTokens(entity.data);
    if (used + tokens > budget) continue;
    used += tokens;
    result.push(entity);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Compact context derivation
// ---------------------------------------------------------------------------

const TERMINAL_SESSION_EVENTS = new Set([
  "session_terminated",
  "session_pr_opened",
  "session_pr_merged",
  "session_pr_closed",
]);

const SIGNAL_LIMIT = 8;

function truncateText(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringifyScalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function pushFact(facts: string[], label: string, value: unknown): void {
  const rendered = stringifyScalar(value);
  if (!rendered) return;
  facts.push(`${label}: ${truncateText(rendered, 80)}`);
}

function humanizeEventType(eventType: string): string {
  return eventType.replace(/_/g, " ");
}

function extractPrimaryText(payload: Record<string, unknown>): string | null {
  const candidate =
    stringifyScalar(payload.text) ??
    stringifyScalar(payload.title) ??
    stringifyScalar(payload.content) ??
    stringifyScalar(payload.description);

  return candidate ? truncateText(candidate) : null;
}

function buildEntitySnapshot(entity: ContextEntity): EntitySnapshot {
  const data = entity.data;
  const label =
    stringifyScalar(data.title) ??
    stringifyScalar(data.name) ??
    stringifyScalar(data.id) ??
    entity.id;
  const facts: string[] = [];

  switch (entity.type) {
    case "chat":
      pushFact(facts, "chat_type", data.type);
      pushFact(facts, "name", data.name);
      pushFact(facts, "members", data.memberCount);
      break;
    case "channel":
      pushFact(facts, "name", data.name);
      pushFact(facts, "type", data.type);
      break;
    case "ticket":
      pushFact(facts, "status", data.status);
      pushFact(facts, "priority", data.priority);
      if (Array.isArray(data.labels) && data.labels.length > 0) {
        facts.push(`labels: ${(data.labels as unknown[]).map((l) => String(l)).join(", ")}`);
      }
      if (Array.isArray(data.assignees) && data.assignees.length > 0) {
        const assignees = (data.assignees as Array<Record<string, unknown>>)
          .map((a) => stringifyScalar(a.name) ?? stringifyScalar(a.id))
          .filter((v): v is string => !!v);
        if (assignees.length > 0) facts.push(`assignees: ${assignees.join(", ")}`);
      }
      break;
    case "session": {
      pushFact(facts, "tool", data.tool);
      pushFact(facts, "agent_status", data.agentStatus);
      pushFact(facts, "session_status", data.sessionStatus);
      const linkedTickets = Array.isArray(data.linkedTickets) ? data.linkedTickets.length : 0;
      facts.push(`linked_tickets: ${linkedTickets}`);
      const repo = asRecord(data.repo);
      if (repo) pushFact(facts, "repo", repo.name ?? repo.id);
      const channel = asRecord(data.channel);
      if (channel) pushFact(facts, "channel", channel.name ?? channel.id);
      break;
    }
    case "repo":
      pushFact(facts, "remote", data.remoteUrl);
      break;
    case "project":
      pushFact(facts, "name", data.name);
      break;
    default: {
      for (const [key, value] of Object.entries(data)) {
        if (key === "id" || key === "title" || key === "name") continue;
        if (facts.length >= 4) break;
        pushFact(facts, key, value);
      }
      break;
    }
  }

  return {
    type: entity.type,
    id: entity.id,
    label: truncateText(label, 100),
    facts,
  };
}

function truncateSnapshotsToFit(snapshots: EntitySnapshot[], budget: number): EntitySnapshot[] {
  const result: EntitySnapshot[] = [];
  let used = 0;

  for (const snapshot of snapshots) {
    const tokens = estimateObjectTokens(snapshot);
    if (used + tokens > budget) continue;
    used += tokens;
    result.push(snapshot);
  }

  return result;
}

function deriveDecisionContext(input: {
  scopeType: string;
  scopeId: string;
  triggerEvent: AgentEvent;
  scopeEntity: ContextEntity | null;
  autonomyMode: string;
  isMention: boolean;
}): DecisionContext {
  const canonicalState: string[] = [];
  const constraints: string[] = [];
  const { scopeType, scopeId, triggerEvent, scopeEntity, autonomyMode, isMention } = input;
  const scopeData = scopeEntity?.data ?? {};

  if (autonomyMode === "observe") {
    constraints.push("Observe mode: prefer summary updates or ignore.");
  } else if (autonomyMode === "suggest") {
    constraints.push("Suggest mode: prefer proposals over direct execution.");
  }

  if (isMention) {
    constraints.push(
      "The agent was directly mentioned and should treat this as an explicit request.",
    );
  }

  if (scopeType === "chat") {
    const chatType = stringifyScalar(scopeData.type);
    if (chatType) canonicalState.push(`chat_type: ${chatType}`);
    if (chatType === "dm") {
      constraints.push("This is a DM scope; reply expectations are higher than in shared scopes.");
    }
  }

  if (scopeType === "ticket") {
    pushFact(canonicalState, "ticket_status", scopeData.status);
    pushFact(canonicalState, "ticket_priority", scopeData.priority);
  }

  if (scopeType === "session") {
    const sessionGroup = asRecord(triggerEvent.payload.sessionGroup);
    const repo = asRecord(scopeData.repo) ?? asRecord(sessionGroup?.repo);
    const channel = asRecord(scopeData.channel) ?? asRecord(sessionGroup?.channel);
    const linkedTickets = Array.isArray(scopeData.linkedTickets)
      ? (scopeData.linkedTickets as Array<Record<string, unknown>>)
      : [];

    if (TERMINAL_SESSION_EVENTS.has(triggerEvent.eventType)) {
      canonicalState.push("session_completed: true");
    }

    if (triggerEvent.eventType === "session_terminated") {
      const failed =
        triggerEvent.payload.status === "failed" || triggerEvent.payload.agentStatus === "failed";
      canonicalState.push(`session_outcome: ${failed ? "failed" : "completed"}`);
    }

    pushFact(
      canonicalState,
      "agent_status",
      scopeData.agentStatus ?? triggerEvent.payload.agentStatus,
    );
    pushFact(canonicalState, "repo", repo?.name ?? repo?.id);
    pushFact(canonicalState, "branch", sessionGroup?.branch);
    pushFact(canonicalState, "pr_url", sessionGroup?.prUrl);
    pushFact(canonicalState, "channel", channel?.name ?? channel?.id);

    if (linkedTickets.length > 0) {
      const linkedIds = linkedTickets
        .map((ticket) => stringifyScalar(ticket.id))
        .filter((value): value is string => !!value);
      canonicalState.push(`linked_ticket_ids: ${linkedIds.join(", ")}`);
    } else {
      canonicalState.push("linked_ticket_ids: none");
      constraints.push("No linked tickets are present, so ticket.addComment is not applicable.");
    }
  }

  if (scopeType === "channel") {
    pushFact(canonicalState, "channel", scopeData.name ?? scopeId);
  }

  return {
    triggerType: triggerEvent.eventType,
    scopeType,
    autonomyMode,
    isMention,
    canonicalState,
    constraints,
  };
}

function toRecentSignal(event: AgentEvent, agentId: string): RecentSignal | null {
  if (event.eventType === "session_output") return null;

  const text = extractPrimaryText(event.payload);
  const actor = event.actorType === "system" ? "system" : `${event.actorType}:${event.actorId}`;

  if (event.eventType === "message_sent" && event.actorType === "user" && text) {
    const mentions = event.payload.mentions;
    const mentioned =
      Array.isArray(mentions) && mentions.some((m) => asRecord(m)?.userId === agentId);

    return {
      timestamp: event.timestamp,
      actor,
      kind: mentioned ? "mention" : "message",
      text: mentioned ? `mentioned the agent: ${text}` : text,
      sourceEventId: event.id,
    };
  }

  if (event.eventType === "session_terminated") {
    const sessionGroup = asRecord(event.payload.sessionGroup);
    const prUrl = stringifyScalar(sessionGroup?.prUrl);
    const failed = event.payload.status === "failed" || event.payload.agentStatus === "failed";
    const reason = stringifyScalar(event.payload.reason);
    const parts = [failed ? "session failed" : "session completed"];
    if (reason && reason !== "bridge_complete") parts.push(`reason=${reason}`);
    if (prUrl) parts.push(`pr=${prUrl}`);

    return {
      timestamp: event.timestamp,
      actor,
      kind: failed ? "session_failed" : "session_completed",
      text: parts.join(" | "),
      sourceEventId: event.id,
    };
  }

  if (event.eventType === "session_pr_opened") {
    const prUrl =
      stringifyScalar(event.payload.prUrl) ??
      stringifyScalar(asRecord(event.payload.sessionGroup)?.prUrl);

    return {
      timestamp: event.timestamp,
      actor,
      kind: "session_pr_opened",
      text: prUrl ? `session opened PR ${prUrl}` : "session opened a pull request",
      sourceEventId: event.id,
    };
  }

  if (event.eventType === "ticket_updated") {
    const changes: string[] = [];
    if (stringifyScalar(event.payload.status)) changes.push(`status=${event.payload.status}`);
    if (stringifyScalar(event.payload.priority)) changes.push(`priority=${event.payload.priority}`);
    if (stringifyScalar(event.payload.title))
      changes.push(`title=${truncateText(String(event.payload.title), 80)}`);

    return {
      timestamp: event.timestamp,
      actor,
      kind: "ticket_updated",
      text: changes.length > 0 ? `ticket updated | ${changes.join(" | ")}` : "ticket updated",
      sourceEventId: event.id,
    };
  }

  if (event.eventType === "session_pr_merged" || event.eventType === "session_pr_closed") {
    return {
      timestamp: event.timestamp,
      actor,
      kind: event.eventType,
      text: humanizeEventType(event.eventType),
      sourceEventId: event.id,
    };
  }

  if (event.eventType === "ticket_created" && text) {
    return {
      timestamp: event.timestamp,
      actor,
      kind: "ticket_created",
      text: `ticket created: ${text}`,
      sourceEventId: event.id,
    };
  }

  if (event.eventType === "ticket_commented" && text) {
    return {
      timestamp: event.timestamp,
      actor,
      kind: "ticket_commented",
      text: `ticket comment: ${text}`,
      sourceEventId: event.id,
    };
  }

  return null;
}

function buildRecentSignals(input: {
  eventBatch: AgentEvent[];
  recentEvents: AgentEvent[];
  agentId: string;
  tokenBudget: number;
}): RecentSignal[] {
  const combined = [...input.eventBatch, ...input.recentEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const signals: RecentSignal[] = [];
  const seen = new Set<string>();
  let used = 0;

  for (const event of combined) {
    const signal = toRecentSignal(event, input.agentId);
    if (!signal) continue;

    const dedupeKey = `${signal.kind}:${signal.actor}:${signal.text}`;
    if (seen.has(dedupeKey)) continue;

    const tokens = estimateObjectTokens(signal);
    if (used + tokens > input.tokenBudget) continue;

    seen.add(dedupeKey);
    used += tokens;
    signals.push(signal);

    if (signals.length >= SIGNAL_LIMIT) break;
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Recent events beyond the batch
// ---------------------------------------------------------------------------

async function fetchRecentEvents(input: {
  organizationId: string;
  scopeType: PrismaScopeType;
  scopeId: string;
  excludeIds: Set<string>;
  limit: number;
}): Promise<AgentEvent[]> {
  const events = await prisma.event.findMany({
    where: {
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    },
    orderBy: { timestamp: "desc" },
    take: input.limit + input.excludeIds.size, // fetch extra to account for exclusions
  });

  interface DbEvent {
    id: string;
    organizationId: string;
    scopeType: string;
    scopeId: string;
    eventType: string;
    actorType: string;
    actorId: string;
    payload: unknown;
    timestamp: Date;
  }

  return (events as DbEvent[])
    .filter((e) => !input.excludeIds.has(e.id))
    .slice(0, input.limit)
    .map((e) => ({
      id: e.id,
      organizationId: e.organizationId,
      scopeType: e.scopeType,
      scopeId: e.scopeId,
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId,
      payload: e.payload as Record<string, unknown>,
      timestamp: e.timestamp.toISOString(),
    }));
}

// ---------------------------------------------------------------------------
// Summary fetching
// ---------------------------------------------------------------------------

async function fetchSummaries(input: {
  organizationId: string;
  scopeType: string;
  scopeId: string;
  relevantEntities: ContextEntity[];
  tokenBudget: number;
}): Promise<ContextSummary[]> {
  const summaries: ContextSummary[] = [];
  let used = 0;

  // Collect all entities we want summaries for (scope + relevant, sorted by priority)
  const targets: Array<{ type: string; id: string; isScope: boolean }> = [
    { type: input.scopeType, id: input.scopeId, isScope: true },
    ...[...input.relevantEntities]
      .sort((a, b) => a.hop - b.hop)
      .map((e) => ({ type: e.type, id: e.id, isScope: false })),
  ];

  // Batch-fetch all summaries and event counts in parallel
  const [scopeSummaryResult, ...entitySummaryResults] = await Promise.all(
    targets.map(async (target) => {
      try {
        const summary = target.isScope
          ? await refreshIfStale(input.organizationId, target.type, target.id)
          : await summaryService.getLatest({
              organizationId: input.organizationId,
              entityType: target.type,
              entityId: target.id,
            });

        if (!summary) return null;

        const eventCount = await summaryService.countEventsSince({
          organizationId: input.organizationId,
          scopeType: target.type,
          scopeId: target.id,
          afterEventId: summary.endEventId ?? undefined,
        });
        const totalCount = summary.eventCount + eventCount;
        const { fresh } = summaryService.isFresh(summary, totalCount);

        return {
          entityType: target.type,
          entityId: target.id,
          content: summary.content,
          structuredData: summary.structuredData as Record<string, unknown>,
          fresh,
          eventCount: summary.eventCount,
        };
      } catch {
        return null;
      }
    }),
  );

  // Add results in priority order, respecting token budget
  const allResults = [scopeSummaryResult, ...entitySummaryResults];
  for (const result of allResults) {
    if (!result) continue;
    const tokens = estimateTokens(result.content);
    if (used + tokens > input.tokenBudget) continue;
    used += tokens;
    summaries.push(result);
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// Actor resolution
// ---------------------------------------------------------------------------

async function resolveActors(events: AgentEvent[]): Promise<ContextActor[]> {
  const actorIds = new Set<string>();
  for (const event of events) {
    if (event.actorId) actorIds.add(event.actorId);
  }

  if (actorIds.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...actorIds] } },
    select: { id: true, name: true },
  });

  const typedUsers = users as Array<{ id: string; name: string | null }>;
  const userMap = new Map(typedUsers.map((u) => [u.id, u]));
  const actors: ContextActor[] = [];

  for (const id of actorIds) {
    const user = userMap.get(id);
    if (user) {
      actors.push({
        id: user.id,
        name: user.name ?? "Unknown",
        role: "member",
        type: "user",
      });
    } else {
      // Could be an agent actor
      actors.push({
        id,
        name: "Agent",
        role: "agent",
        type: "agent",
      });
    }
  }

  return actors;
}

// ---------------------------------------------------------------------------
// Main context builder
// ---------------------------------------------------------------------------

export interface BuildContextInput {
  batch: AggregatedBatch;
  agentSettings: OrgAgentSettings;
  /** Optional project-level soul file override. */
  projectSoulFile?: string;
  /** Optional repo-level soul file (from .trace/soul.md). */
  repoSoulFile?: string;
  /** Optional token budget override (e.g. TIER3_TOKEN_BUDGET for premium model). */
  tokenBudget?: TokenBudgetConfig;
}

/**
 * Build a structured context packet from an aggregated event batch.
 *
 * This is the main entry point. The context builder:
 * 1. Identifies the trigger event
 * 2. Fetches the scope entity
 * 3. Searches for relevant entities via bounded graph traversal
 * 4. Fetches summaries with freshness checks
 * 5. Resolves actor information
 * 6. Filters actions by scope
 * 7. Respects token budget throughout
 */
export async function buildContext(input: BuildContextInput): Promise<AgentContextPacket> {
  const { batch, agentSettings } = input;
  const { organizationId, scopeKey, events } = batch;

  // Parse scope type and ID from scope key
  const scopeType = scopeKey.split(":")[0] as PrismaScopeType;
  const scopeId = parseScopeId(scopeKey);

  // Trigger event = most recent in batch
  const triggerEvent = events[events.length - 1];

  const budget = input.tokenBudget
    ? { total: input.tokenBudget.total, sections: { ...input.tokenBudget.sections } }
    : { total: DEFAULT_TOKEN_BUDGET.total, sections: { ...DEFAULT_TOKEN_BUDGET.sections } };
  const sectionTokens: Record<string, number> = {};
  let totalUsed = 0;

  // Track actual tokens per section
  function recordSection(name: string, tokens: number): void {
    sectionTokens[name] = tokens;
    totalUsed += tokens;
  }

  // --- 1. Trigger event ---
  recordSection("triggerEvent", estimateObjectTokens(triggerEvent));

  // --- 2. Action schema (high priority — planner needs to know what it can do) ---
  const scopeTypeForActions = toScopeType(scopeType);
  const actions = getActionsByScope(scopeTypeForActions);
  recordSection("actionSchema", estimateObjectTokens(actions));

  // --- 3. Soul file (resolved from platform default → org → project → repo) ---
  const soulFile = resolveSoulFile({
    orgSoulFile: agentSettings.soulFile ?? "",
    projectSoulFile: input.projectSoulFile,
    repoSoulFile: input.repoSoulFile,
    tokenBudget: budget.sections.soulFile,
  });
  recordSection("soulFile", estimateTokens(soulFile));

  // --- 4. Scope entity ---
  const scopeEntity = await fetchScopeEntity(scopeType, organizationId, scopeId);
  if (scopeEntity) {
    recordSection("scopeEntity", estimateObjectTokens(scopeEntity.data));
  }

  // --- 5. Event batch ---
  let eventBatch = events;
  const batchTokens = estimateObjectTokens(events);
  const batchBudget = budget.sections.eventBatch;
  if (batchTokens > batchBudget) {
    // Truncate from oldest events
    eventBatch = truncateEventsToFit(events, batchBudget);
  }
  recordSection("eventBatch", estimateObjectTokens(eventBatch));

  // --- 6. Relevant entities via search and link traversal ---
  const relevantEntities = await findRelevantEntities({
    organizationId,
    scopeType,
    scopeId,
    scopeEntity,
    events,
    tokenBudget: budget.sections.relevantEntities,
  });
  recordSection("relevantEntities", estimateObjectTokens(relevantEntities));

  // --- 6b. Resolve effective autonomy mode (ticket #20) ---
  const isDmScope = scopeType === "chat" && scopeEntity?.data.type === "dm";
  const scopeEntityAiMode = scopeEntity?.data.aiMode as string | null | undefined;
  const effectiveAutonomyMode = await resolveAutonomyMode({
    scopeType: scopeType as AutonomyScopeType,
    scopeId,
    organizationId,
    isDm: isDmScope,
    orgDefault: agentSettings.autonomyMode,
    prefetchedAiMode:
      scopeEntityAiMode != null
        ? (scopeEntityAiMode as import("@prisma/client").AutonomyMode)
        : scopeEntity
          ? null
          : undefined,
  });

  // --- 6c. Canonical decision context + compact entity snapshots ---
  const decisionContext = deriveDecisionContext({
    scopeType,
    scopeId,
    triggerEvent,
    scopeEntity,
    autonomyMode: effectiveAutonomyMode,
    isMention: isTriggerMention(triggerEvent, agentSettings.agentId),
  });
  recordSection("decisionContext", estimateObjectTokens(decisionContext));

  const entitySnapshotCandidates: EntitySnapshot[] = [
    ...(scopeEntity ? [buildEntitySnapshot(scopeEntity)] : []),
    ...relevantEntities.map((entity) => buildEntitySnapshot(entity)),
  ];
  const entitySnapshots = truncateSnapshotsToFit(
    entitySnapshotCandidates,
    budget.sections.entitySnapshots,
  );
  recordSection("entitySnapshots", estimateObjectTokens(entitySnapshots));

  // --- 7. Summaries ---
  //    Privacy guard (ticket #17): DM summaries are never generated automatically.
  //    They are only produced on explicit user request. Group chat summaries are
  //    generated automatically but scoped — they never leak into unrelated contexts.
  const summaries = isDmScope
    ? [] // skip auto-summaries for DMs
    : await fetchSummaries({
        organizationId,
        scopeType,
        scopeId,
        relevantEntities,
        tokenBudget: budget.sections.summaries,
      });
  recordSection("summaries", estimateObjectTokens(summaries));

  // --- 7b. Derived memories ---
  // Try hybrid search (semantic + recency) first, fall back to recency-only.
  const relevantSubjects = extractSubjects(events, relevantEntities, scopeEntity);
  let memories: ContextMemory[] = [];
  if (budget.sections.memories > 0) {
    try {
      // Build query text from trigger event for semantic search
      const triggerText =
        triggerEvent.payload.text ??
        triggerEvent.payload.title ??
        triggerEvent.payload.content ??
        JSON.stringify(triggerEvent.payload).slice(0, 200);

      const rawMemories = await memoryService
        .hybridSearch({
          organizationId,
          scopeType: scopeType as PrismaScopeType,
          scopeId,
          isDm: isDmScope,
          queryText: String(triggerText),
          relevantSubjects,
          tokenBudget: budget.sections.memories,
        })
        .catch(() =>
          // Fall back to recency-only if hybrid search fails (e.g., no embeddings)
          memoryService.fetchForContext({
            organizationId,
            scopeType: scopeType as PrismaScopeType,
            scopeId,
            isDm: isDmScope,
            relevantSubjects,
            tokenBudget: budget.sections.memories,
          }),
        );
      memories = rawMemories.map((m) => ({
        kind: m.kind,
        subjectType: m.subjectType,
        subjectId: m.subjectId,
        content: m.content,
        confidence: m.confidence,
      }));
    } catch {
      // Non-critical — agent works without memories
    }
  }
  recordSection("memories", estimateObjectTokens(memories));

  // --- 8. Recent events beyond the batch ---
  const batchIds = new Set(events.map((e) => e.id));
  const recentEvents = await fetchRecentEvents({
    organizationId,
    scopeType,
    scopeId,
    excludeIds: batchIds,
    limit: 20,
  });
  // Truncate to fit budget
  const recentTruncated = truncateEventsToFit(recentEvents, budget.sections.recentEvents);
  recordSection("recentEvents", estimateObjectTokens(recentTruncated));

  // --- 8b. Normalized recent signals ---
  const recentSignals = buildRecentSignals({
    eventBatch,
    recentEvents: recentTruncated,
    agentId: agentSettings.agentId,
    tokenBudget: budget.sections.recentSignals,
  });
  recordSection("recentSignals", estimateObjectTokens(recentSignals));

  // --- 9. Actors ---
  const actors = await resolveActors([...events, ...recentTruncated]);
  recordSection("actors", estimateObjectTokens(actors));

  return {
    organizationId,
    scopeKey,
    scopeType,
    scopeId,
    isDm: isDmScope,
    isMention: isTriggerMention(triggerEvent, agentSettings.agentId),
    triggerEvent,
    eventBatch,
    soulFile,
    scopeEntity,
    relevantEntities,
    decisionContext,
    entitySnapshots,
    recentEvents: recentTruncated,
    summaries,
    memories,
    recentSignals,
    actors,
    permissions: {
      autonomyMode: effectiveAutonomyMode,
      actions,
    },
    tokenBudget: {
      total: budget.total,
      used: totalUsed,
      sections: sectionTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the entity ID from a scope key.
 * Handles formats like "chat:abc123", "chat:abc123:thread:msg456", "ticket:abc123".
 */
function parseScopeId(scopeKey: string): string {
  const parts = scopeKey.split(":");
  // For "chat:id:thread:parentId", the scope ID is the chat ID
  return parts[1] ?? parts[0];
}

/** Check if the trigger event is an @mention of the agent. */
function isTriggerMention(triggerEvent: AgentEvent, agentId: string): boolean {
  const mentions = triggerEvent.payload.mentions;
  return (
    Array.isArray(mentions) &&
    mentions.some(
      (m) =>
        typeof m === "object" && m !== null && (m as Record<string, unknown>).userId === agentId,
    )
  );
}

/** Map raw scope type strings to the typed ScopeType union. */
function toScopeType(scopeType: string): ScopeType {
  const valid: ScopeType[] = ["chat", "channel", "ticket", "session", "project", "system"];
  if (valid.includes(scopeType as ScopeType)) {
    return scopeType as ScopeType;
  }
  return "system"; // fallback for unknown scope types
}

/** Truncate events list (from oldest) to fit within a token budget. */
function truncateEventsToFit(events: AgentEvent[], budget: number): AgentEvent[] {
  // Keep most recent events (they're more relevant to the planner)
  const result: AgentEvent[] = [];
  let used = 0;

  // Iterate from newest to oldest
  for (let i = events.length - 1; i >= 0; i--) {
    const tokens = estimateObjectTokens(events[i]);
    if (used + tokens > budget) break;
    used += tokens;
    result.unshift(events[i]);
  }

  return result;
}

/**
 * Extract subject identifiers from events and entities for memory retrieval.
 * Returns a list of { type, id } pairs representing entities that memories
 * might be about.
 */
function extractSubjects(
  events: AgentEvent[],
  relevantEntities: ContextEntity[],
  scopeEntity: ContextEntity | null,
): Array<{ type: string; id: string }> {
  const seen = new Set<string>();
  const subjects: Array<{ type: string; id: string }> = [];

  function add(type: string, id: string): void {
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    subjects.push({ type, id });
  }

  // Scope entity
  if (scopeEntity) {
    add(scopeEntity.type, scopeEntity.id);
  }

  // Relevant entities
  for (const entity of relevantEntities) {
    add(entity.type, entity.id);
  }

  // Actors from events
  for (const event of events) {
    if (event.actorId) {
      add(event.actorType === "agent" ? "agent" : "user", event.actorId);
    }
  }

  return subjects;
}
