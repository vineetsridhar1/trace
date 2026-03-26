# Trace Ambient AI Implementation Spec v0.2

## Purpose

This document is a build-ready implementation spec for the ambient AI system in Trace. It is written to be handed directly to an AI coding agent or engineering team as the blueprint for a v1 implementation.

It assumes the existing Trace architecture described in the product document:

- Trace is event-driven.
- Everything meaningful becomes an event.
- Agents are first-class actors.
- Tickets are derived state.
- GraphQL is the external client API.
- The service layer is the system of record for business logic, auth, validation, and event creation.
- The ambient agent lives on the server and should subscribe to the event stream and call services directly.

The goal of this spec is to define how to introduce an always-on, proactive AI runtime that can observe the entire organization, reason over current and historical context, and safely take actions using the same capabilities available to users.

---

## 1. Executive Summary

The ambient AI in Trace should be implemented as a **separately deployed backend service** that runs in the same trusted server environment as the rest of the platform and shares the same codebase contracts, domain types, service methods, auth model, and observability.

It should integrate with the existing system in exactly two ways:

1. **Read path:** subscribe to the organization event stream through the real-time broker / event infrastructure.
2. **Write path:** invoke the existing service layer as an authenticated internal actor (`actor_type = agent`) to perform actions.

The ambient AI should **not**:

- call GraphQL mutations internally,
- mutate the database directly,
- create events directly,
- bypass auth or business logic,
- or live in the web/mobile client.

The ambient AI should be modeled as a **server-side actor runtime** composed of:

- event ingestion,
- routing and filtering,
- windowed event aggregation,
- context building with token budget management,
- retrieval and memory,
- tiered model planning with confidence-based promotion,
- policy enforcement with confidence-to-action routing,
- action execution through a reflective service registry,
- suggestion delivery via the existing Inbox system,
- and evaluation / telemetry with cost tracking.

The correct mental model is:

```text
Domain events happen
  -> AI runtime observes them
  -> Router filters cheaply (code, no LLM)
  -> Aggregator batches related events into coherent units
  -> Context builder assembles a token-budgeted context packet
  -> Tiered planner decides whether to ignore, suggest, or act
  -> Policy engine routes by confidence: execute / suggest / drop
  -> Executor calls service layer through action registry
  -> Service layer creates normal events
  -> Users and agents observe the new state
```

---

## 2. Design Goals

### Primary goals

- Make the AI feel omnipresent without making it chaotic.
- Let the AI see everything relevant in the product.
- Let the AI take actions safely through existing system contracts.
- Keep the system auditable, replayable, and explainable.
- Make AI behavior incremental: suggest first, automate later.
- Preserve the existing Trace architecture rather than bolt on a parallel AI subsystem.
- Control inference costs through tiered model usage and cost budgets.
- Maintain strict data isolation between organizations.

### Non-goals for v1

- A single fully autonomous model that continuously reasons over the entire company state.
- Replacing the service layer with model-defined behaviors.
- Allowing the model to invent capabilities not represented as registered actions.
- Using a vector store as a primary retrieval mechanism (deferred to Phase 2).
- Sending every event through an expensive model call.
- Cross-organization context sharing of any kind.

---

## 3. Architectural Positioning in Trace

The ambient AI should fit into the existing Trace backend as follows:

```text
Clients (web / mobile / electron)
  -> GraphQL
  -> Service Layer
  -> Event Store
  -> Real-Time Broker

Ambient Agent Runtime
  -> subscribes to event stream via broker
  -> reads state via entity/read services
  -> calls Service Layer directly
  -> creates suggestions via InboxItem
```

### Existing system assumptions this design preserves

1. **Service layer remains the only place that creates state transitions.**
2. **Events remain the universal primitive.**
3. **GraphQL remains for external clients only.**
4. **Human and agent behavior remain symmetrical at the service boundary.**
5. **Sessions, tickets, channels, repos, and projects remain top-level entities linked through IDs, not nested ownership.**
6. **InboxItem remains the delivery mechanism for user-facing notifications and suggestions.**

### Core rule

The AI is a **participant in the event system**, not a second control plane.

---

## 4. High-Level System Overview

Implement the ambient AI as a dedicated subsystem called the **Agent Runtime**.

### Main components

1. **Event Consumer**
2. **Event Router / Filter**
3. **Event Aggregator (windowed batching)**
4. **Context Builder (with token budget management)**
5. **Memory + Retrieval Layer**
6. **Tiered Planner / Decision Engine**
7. **Policy Engine (with confidence-based routing)**
8. **Action Executor (reflective service registry)**
9. **Suggestion Delivery (via InboxItem)**
10. **Cost Tracker**
11. **Telemetry + Evaluation**

### End-to-end flow

```text
Event emitted by Trace
  -> Event Consumer receives event
  -> Router decides whether this event is worth deeper processing (code, no LLM)
  -> Aggregator batches the event into a scope window or forwards immediately
  -> When the window closes, Context Builder fetches local state and related entities
  -> Context Builder assembles a token-budgeted context packet
  -> Retrieval layer fetches relevant prior memory / summaries
  -> Tiered Planner decides: ignore / suggest / act / summarize / escalate
  -> Policy Engine evaluates confidence against risk thresholds
  -> High confidence + low risk -> Action Executor calls service methods directly
  -> Medium confidence or higher risk -> Suggestion created as InboxItem
  -> Low confidence -> drop (log for eval, no user-visible output)
  -> Cost Tracker records inference spend per org
  -> Evaluation pipeline records outcome
```

---

## 5. Organization Isolation Model

**The organization ID is the partition key for everything the AI touches.** Every query, every memory lookup, every summary, every execution log — all scoped by org. There is no cross-org join, no cross-org retrieval, no shared context.

### Core isolation rules

1. Every event the agent processes carries an `organizationId`. This flows through the entire pipeline as an immutable context field.
2. The context builder only queries entities within the event's org.
3. The retrieval layer only searches within the event's org.
4. Summaries, execution logs, and processed-event records are all partitioned by org.
5. Agent identities are per-org. The agent in Org A and the agent in Org B are different actors with different IDs, different permission grants, different trust levels, and different accumulated context.
6. Per-org settings control whether the agent is active, what autonomy mode it runs in, what model tier it uses, and what cost budget it has.
7. The planner prompt is hydrated per-org with org-specific configuration.

### Agent organization context

```ts
interface AgentOrgContext {
  organizationId: string;
  agentId: string;
  orgSettings: {
    aiEnabled: boolean;
    autonomyMode: "observe" | "suggest" | "act";
    modelTier: "default" | "custom";
    costBudget: {
      dailyLimitCents: number;
      currentUsageCents: number;
    };
    customPreferences: Record<string, unknown>;
  };
}
```

### Enforcement pattern

Every agent-layer query should use an org-scoping helper to prevent accidental cross-org data access:

```ts
function orgScoped<T>(query: (orgId: string) => Promise<T>, context: AgentOrgContext): Promise<T> {
  if (!context.organizationId) throw new Error("Missing org scope — this is a bug");
  return query(context.organizationId);
}
```

This is a belt-and-suspenders pattern. The service layer already validates org access, but adding the check at the agent layer means a bug in the context builder cannot accidentally leak cross-org data into a planner prompt.

### Database indexing requirement

Every table the agent writes to must have `organizationId` as a required non-nullable column and as the leading index key. This ensures:

- All agent queries are org-scoped by default.
- Org data deletion (customer offboarding, GDPR) is a simple `DELETE WHERE organization_id = ?` across all agent tables.
- No cross-org index scanning occurs.

---

## 6. Deployment Strategy

### Recommended deployment shape

Use the **same repo / same backend codebase** but deploy the AI as a **separate service process**.

Recommended services:

- `api`
- `agent-worker`
- optionally later: `agent-memory-worker`, `agent-eval-worker`

### Why separate deployment

- Different latency profile than the API.
- Can run long-lived jobs and retries.
- Can process events asynchronously.
- Easier to scale independently.
- Failure isolation from user-facing request paths.
- Better for queueing, batching, and backpressure.

### Why same codebase initially

- Reuse domain models and service contracts.
- Reuse auth and policy logic.
- Reuse event types.
- Keep the integration surface small and strongly typed.
- Avoid premature microservice fragmentation.

### Final recommendation

**Same backend codebase, separate deployment, shared service contracts.**

---

## 7. Event Subscription Model

The AI should subscribe to **domain events** through the existing event infrastructure.

### It should not subscribe by

- polling database tables,
- scraping GraphQL subscriptions,
- wiring directly into every domain service,
- or relying on frontend/UI events.

### It should subscribe to

- the append-only event log,
- the real-time broker,
- or an event-outbox stream backed by the event store.

### Good v1 implementation options

#### Option A: Postgres outbox / event log tailing

Best if Trace is still early and event throughput is manageable.

Implementation shape:

- every service write appends a durable event row,
- the agent worker reads from this event stream using a cursor/checkpoint,
- events are processed asynchronously,
- processed offsets are stored per consumer.

#### Option B: Dedicated broker consumer

Best if the broker is already first-class and durable.

Implementation shape:

- service layer appends to event store,
- broker fans out to consumers,
- agent joins as consumer group,
- at-least-once delivery with consumer offset tracking.

### Recommendation for v1

Use the **same event source used by the real-time broker**, but ensure the agent gets a **durable replayable stream** rather than a transient websocket-style feed.

### Required delivery semantics

- At-least-once delivery
- Stable event IDs
- Replay support
- Per-consumer checkpointing
- Idempotent downstream actions

---

## 8. Event Envelope Requirements

The AI needs a normalized event envelope for routing and context assembly.

Use the existing event primitive and ensure every delivered event includes at least:

```ts
interface DomainEvent {
  id: string;
  organizationId: string;
  scopeType: "channel" | "chat" | "session" | "ticket" | "system";
  scopeId: string;
  actorType: "user" | "agent" | "system";
  actorId: string;
  eventType: string;
  payload: Record<string, unknown>;
  parentId: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}
```

### Event categories the agent should care about first

#### Communication

- `message.sent` (channels and chats)
- `message.edited` (channels and chats)
- `thread.created`
- `reaction.added` (usually low priority)

#### Chat lifecycle

- `chat.created` (DM or group chat)
- `chat.member_added` (agent added to chat — triggers observation)
- `chat.member_removed` (agent removed — stop observing)
- `chat.renamed` (group chat rename)

#### Ticket lifecycle

- `ticket.created`
- `ticket.updated`
- `ticket.status_changed`
- `ticket.assigned`
- `comment.added`
- `label.applied`

#### Session lifecycle / tool execution

- `session.created`
- `session.status_changed`
- `tool.invoked`
- `tool.result`
- `file.created`
- `file.modified`
- `command.executed`
- `ai.response`

#### Agent-specific

- `agent.suggestion`
- `agent.action_taken`
- `agent.escalation`
- `agent.feedback.recorded`

#### System / integration

- `webhook.received`
- `integration.synced`
- `member.joined`
- `permission.changed`

### Important requirement

The event envelope should be rich enough for **routing and dedupe**, but not so large that every event contains the entire world.

---

## 9. Agent Runtime Components

## 9.1 Event Consumer

Responsible for:

- reading durable events,
- checkpointing consumer progress,
- dispatching events into internal queues,
- replay support,
- failure retries.

### Responsibilities

- subscribe to the event stream,
- deserialize event envelopes,
- store consumer offset/checkpoint,
- attach tracing metadata,
- write raw event metrics,
- hand off to the router.

### Requirements

- must support replay for debugging,
- must be horizontally scalable,
- must preserve ordering at least within an organization / scope when required,
- must never call the model directly.

---

## 9.2 Event Router / Filter

This is the first intelligence layer, but it must be **entirely deterministic and cheap**. No LLM calls.

### Purpose

Avoid sending every event to the full planner. This layer processes every single event, so even a fraction of a cent per event adds up. Code is free.

### Responsibilities

- classify event type,
- score likely actionability,
- debounce noisy scopes,
- ignore low-value events,
- check org-level AI settings (is AI enabled for this org?),
- check scope-level settings (is AI enabled for this channel/project?),
- check cost budget (has this org exceeded its daily inference budget?),
- decide whether to forward to aggregator, send directly to planner, or drop.

### Example routing outcomes

- `message.sent` in product channel -> forward to aggregator (batch with thread)
- `message.sent` in chat where agent is member -> forward to aggregator
- `message.sent` in chat where agent is not member -> drop (no observation without membership)
- `chat.member_added` where new member is agent -> register chat for observation
- `chat.member_removed` where removed member is agent -> deregister chat, stop observing
- `ticket.assigned` to agent -> send directly to planner (high priority, skip aggregation)
- `tool.result` with test failure -> forward to session-monitoring pipeline
- `reaction.added` -> drop or memory-only pipeline
- `file.modified` burst -> forward to aggregator (summarize later)
- any event where `actorId` matches the agent's own ID -> drop (self-trigger suppression)
- any event where org AI is disabled -> drop
- any event where org cost budget is exhausted -> downgrade to observe-only

### Chat membership gate

The router must enforce a **membership check** for chat-scoped events. Unlike channels (which are team-visible and always observable), DMs and group chats require explicit agent membership for observation. The agent only processes events from chats where it is an active member (`ChatMember.leftAt IS NULL`).

The router maintains an in-memory set of chat IDs the agent is a member of, updated by `chat.member_added` and `chat.member_removed` events.

```ts
// In the event router
if (event.scopeType === 'chat') {
  if (!agentChatMemberships.has(event.scopeId)) return 'drop';
}
```

### Required heuristics

- rate limit per scope,
- burst coalescing,
- dedupe repetitive activity,
- ignore self-trigger loops,
- chat membership gate (only observe chats where agent is a member),
- respect org/project/channel AI settings,
- respect ticket/session autonomy mode,
- cost budget enforcement.

### Recommended implementation

Implement this as code, not model prompting. A switch on event type with rate limiting and burst detection is sufficient for v1.

---

## 9.3 Event Aggregator (Windowed Batching)

This is a new component between the router and context builder. Many of the best ambient behaviors require reasoning over **clusters** of events — a thread of 8 messages about a bug is one conceptual unit, not 8 independent triggers.

### Purpose

Batch related events into coherent units before invoking the planner, reducing model calls and producing better decisions.

### Behavior

When the router forwards an event, the aggregator checks whether an active window exists for that scope (e.g., the channel thread, the ticket, the session). If yes, the event is added to the existing window. If no, a new window is opened.

A window closes when:

- a configurable silence period elapses (default: 30 seconds of no new events in that scope),
- the window reaches a maximum event count (default: 25 events),
- or a maximum wall-clock time elapses (default: 5 minutes).

When the window closes, the entire batch of events is forwarded to the context builder as a single trigger.

### Bypass rules

Some events should bypass aggregation entirely and go straight to the planner:

- `ticket.assigned` where assignee is the agent (explicit agent ownership),
- explicit @mention of the agent,
- `session.status_changed` to `needs_input` or `failed`,
- events in scopes configured for immediate response.

### Data structure

```ts
interface AggregationWindow {
  scopeKey: string; // e.g., "channel:ch_123:thread:th_456" or "chat:chat_789:thread:msg_012"
  organizationId: string;
  events: DomainEvent[];
  openedAt: string;
  lastEventAt: string;
  silenceTimeoutMs: number; // default 30000
  maxEvents: number; // default 25
  maxWallClockMs: number; // default 300000
}
```

### Scope key construction

The scope key determines how events are grouped. Each independent conversation gets its own window:

```ts
function buildScopeKey(event: DomainEvent): string {
  const threadId = event.metadata.threadId || event.metadata.parentMessageId;

  switch (event.scopeType) {
    case "channel":
      return threadId
        ? `channel:${event.scopeId}:thread:${threadId}`
        : `channel:${event.scopeId}`;
    case "chat":
      return threadId
        ? `chat:${event.scopeId}:thread:${threadId}`
        : `chat:${event.scopeId}`;
    case "ticket":
      return `ticket:${event.scopeId}`;
    case "session":
      return `session:${event.scopeId}`;
    default:
      return `${event.scopeType}:${event.scopeId}`;
  }
}
```

### Implementation notes

- Windows are in-memory but should be recoverable (persist to Redis or similar if the worker restarts).
- The silence timeout should be configurable per scope type (channels may want longer windows than tickets).
- When the aggregator produces a batch, the "trigger event" for the context builder is the most recent event, with the full batch available as context.

---

## 9.4 Context Builder

The context builder is the most important subsystem after the service layer. Its job is to convert a raw event (or event batch) into a compact, relevant working set for the planner. **The planner is only as good as what the context builder feeds it.**

### Inputs

- the triggering event (or event batch from aggregator),
- current entity state,
- linked entities (bounded traversal),
- recent events in local scope,
- summaries / memories (with freshness validation),
- permissions / policy state,
- relevant organizational metadata,
- available actions for this scope.

### Outputs

A structured context packet that fits within a defined token budget.

```ts
interface AgentContextPacket {
  triggerEvent: DomainEvent;
  eventBatch?: DomainEvent[];
  organization: {
    id: string;
    name: string;
    settings: Record<string, unknown>;
  };
  scope: {
    type: "channel" | "chat" | "ticket" | "session" | "system";
    id: string;
    entity: Record<string, unknown>;
  };
  linkedEntities: Array<{
    type: string;
    id: string;
    entity: Record<string, unknown>;
    hopDistance: number;
  }>;
  recentEvents: DomainEvent[];
  summaries: Record<string, string>;
  retrievalResults: Array<Record<string, unknown>>;
  permissions: {
    allowedActions: string[];
    autonomyMode: "observe" | "suggest" | "act";
  };
  tokenBudget: {
    total: number;
    allocated: Record<string, number>;
    remaining: number;
  };
}
```

### Token budget management

The context packet will be serialized into a prompt. Without explicit budget management, long threads blow context windows and short summaries starve the planner of information.

Define a token budget strategy with priority-ranked allocation:

```ts
interface TokenBudgetConfig {
  totalBudget: number; // e.g., 32000 tokens for Tier 2, 64000 for Tier 3
  allocations: {
    triggerEvent: number; // 2000 — always included in full
    eventBatch: number; // 8000 — recent batch, truncated from oldest
    soulFile: number; // 2000 — org soul file (identity, rules, domain context)
    scopeEntity: number; // 2000 — current entity state
    linkedEntities: number; // 6000 — linked entities, diminishing per hop
    recentEvents: number; // 6000 — recent events in scope
    summaries: number; // 4000 — rolling summaries
    retrievalResults: number; // 2000 — semantic retrieval (Phase 2)
    actionSchema: number; // 2000 — available actions
  };
}
```

Modern models (Sonnet-class at 200K context, Opus-class at 200K+) can handle much larger context windows. The budget should use a meaningful fraction of the available context — starving the planner of information produces worse decisions than the marginal cost of additional input tokens. These defaults target ~30-50% of available context, leaving headroom for the system prompt, output, and safety margin.

The context builder fills the packet greedily by priority:

1. Trigger event (always in full)
2. Action schema (planner needs to know what it can do)
3. Soul file (planner needs to know who it is)
4. Scope entity state
5. Event batch from aggregator
6. Linked entities (first hop gets more budget than second hop)
7. Summaries
8. Recent events (fill remaining budget)
9. Retrieval results (Phase 2)

If a section exceeds its budget, it is truncated. Events are truncated from oldest. Linked entities are truncated from furthest hops. Summaries are truncated from least relevant scope.

### Bounded graph traversal

When a message in #backend references a ticket, which triggers a session lookup, which links to a repo — how deep do you chase the graph?

**Policy: maximum 2 hops with diminishing token allocation per hop.**

- **Hop 0:** The trigger scope entity (the channel, ticket, or session where the event occurred). Full token allocation.
- **Hop 1:** Directly linked entities (ticket linked to this thread, session linked to this ticket, project this channel belongs to). 60% of `linkedEntities` budget.
- **Hop 2:** Entities linked to hop-1 entities (repo linked to the session found at hop 1, other tickets in the same project). 40% of `linkedEntities` budget.
- **No hop 3.** If deeper context is needed, summaries should cover it.

### Summary freshness contract

Summaries are the compressed representation of long histories. If a rolling channel summary is 200 messages behind, the planner works with bad information.

**Freshness rules:**

- A summary is "fresh" if it covers events up to within N events or T minutes of the current event.
- Default freshness thresholds: 20 events or 30 minutes, whichever is reached first.
- If the context builder detects a stale summary for a high-priority event (agent @mention, urgent ticket, explicit agent assignment), it triggers a **synchronous summary refresh** before building the context packet. This adds latency but ensures quality.
- For normal-priority events, the context builder uses the existing summary and flags its staleness in the context metadata. A background worker will refresh it asynchronously.

### Context builder rules

1. Prefer **deterministic structured lookup** first.
2. Pull only the **minimum local context** necessary within the token budget.
3. Use summaries when histories are long. Validate freshness.
4. Respect the hop limit for linked entity traversal.
5. Context should be **event-scoped**, not "entire-org prompt" scoped.
6. Always include the available action schema so the planner knows its options.
7. Log the final token allocation for observability.

---

## 9.5 Retrieval and Memory Layer

Trace needs retrieval, but not "RAG as the center of the universe."

The correct design is a **three-layer context system**, with the third layer deferred to Phase 2.

### Layer 1: Structured retrieval (v1)

Use the relational/app graph first. This should answer most requests.

Examples:

- fetch ticket linked to this thread,
- fetch session linked to this ticket,
- fetch repo linked to this project,
- fetch recent events in current scope,
- fetch actor and membership info,
- fetch org policy/settings.

### Layer 2: Rolling summary memory (v1)

Long histories need compression. Maintain AI-generated summaries for:

- channels,
- chats (group chats where agent is a member; not DMs unless explicitly requested),
- tickets,
- sessions,
- projects,
- repos,
- optionally org-level memory.

### Layer 3: Semantic retrieval (Phase 2 — deferred)

Use embeddings / similarity search for fuzzy association. **Not required for v1.** The v1 feature set (ticket suggestions, linking, comment assistance, session monitoring) is well-served by structured retrieval + recent event windows + summaries.

Semantic search becomes essential when you need to find "similar past incidents" or "related conversations from months ago." Add it when you have real usage data showing where deterministic lookups fall short.

When implemented, use vector search for:

- messages,
- ticket descriptions / comments,
- session summaries,
- project summaries,
- selected documents / docs later.

**Important:** the embedding index must be partitioned by organization. For v1 of semantic retrieval, use a single table with `organizationId` as a filter column on every query. For later scale, consider per-org index namespaces in a dedicated vector store.

### Memory store concepts

#### Hot memory

Recent events in the current scope. Served by the event store directly.

#### Entity memory

Durable summaries per channel/ticket/session/project. Stored in the `EntitySummary` table.

#### Episodic memory (Phase 2)

Important prior investigations, incidents, and resolutions. Requires semantic retrieval.

#### Policy memory

User/org preferences about how proactive the AI should be. Stored in org/scope settings.

### Summary write strategy

Summaries are not just a read-path optimization — they are a critical data product that the planner depends on. Bad summaries poison every downstream decision.

**When does a rolling summary update?**

- A background worker continuously processes events per scope.
- A summary update is triggered when the scope accumulates N new events since the last summary (default: 20 events) OR when T minutes have elapsed (default: 30 minutes), whichever comes first.
- Milestone summaries are written on significant state transitions (ticket closed, session completed, project milestone reached).

**Synchronous vs. asynchronous:**

- Summary generation is **asynchronous by default** — a background worker maintains them.
- The context builder can trigger a **synchronous refresh** if the summary is stale and the event is high-priority (see freshness contract in Section 9.4).
- Synchronous refresh adds 1-3 seconds of latency but ensures the planner has accurate context.

**Summary quality:**

- Summaries should be **factual and structured**, not narrative. Include: key decisions made, open questions, action items, blockers, and entities referenced.
- Periodically spot-check summary quality against source events (automated eval in Phase 5).

### Important rule

The event log is the raw substrate. The memory layer is the compressed working memory. The vector store (when added) is only one retrieval mechanism, not the system of record.

---

## 9.6 Tiered Planner / Decision Engine

The planner is where the model decides what to do. It operates on a **tiered LLM system** to balance quality against cost.

### LLM Tiers

#### Tier 1 — Router (no LLM)

This is the Event Router (Section 9.2). It answers: "does this event deserve any AI attention at all?" Implemented entirely as deterministic code. Processes every event at zero inference cost.

#### Tier 2 — Workhorse model (Haiku/Sonnet-class)

Handles the vast majority of planner decisions. Used for:

- standard event reasoning and action selection,
- rolling summary generation,
- routine ticket suggestions,
- comment assistance,
- session monitoring.

Fast enough for acceptable suggestion latency, cheap enough to call on the 10-20% of events that pass the router.

#### Tier 3 — Premium model (Opus-class)

Reserved for high-stakes decisions and complex reasoning. Used 1-5% of the time. Called when:

- the event involves a ticket with priority `urgent` or `high`,
- the Tier 2 planner explicitly requests promotion (outputs `promotionReason`),
- a user directly @mentioned the agent with a complex question,
- the context involves cross-scope reasoning (connecting conversation → ticket → session),
- the event is an explicit agent assignment (ticket assigned to agent).

### Promotion system

The Tier 2 planner can explicitly request promotion:

```ts
interface PlannerOutput {
  disposition: "ignore" | "suggest" | "act" | "summarize" | "escalate";
  confidence: number;
  rationaleSummary: string;
  proposedActions: Array<{
    actionType: string;
    args: Record<string, unknown>;
  }>;
  userVisibleMessage?: string;
  followUpAfterMs?: number;
  promotionReason?: string; // if set, re-run with Tier 3
}
```

**Promotion rules:**

- Rule-based promotions bypass Tier 2 entirely (no latency chain). The router can identify "this goes straight to Tier 3" cases.
- Model-requested promotions discard the Tier 2 output and re-run with the promoted model using the same context packet.
- Never run Tier 2 as a pre-filter for Tier 3. Either skip to Tier 3 or run Tier 2 and optionally promote.

<!-- Updated after multi-turn agentic loop implementation:
- The default Tier 2 model is Haiku (fast, cheap). The planner chooses its own escalation target
  via `promotionTarget: "sonnet" | "opus"` — Sonnet for moderate complexity, Opus for high complexity.
  Default is Sonnet if omitted. Only Opus promotions are budget-gated.
- @mentions no longer auto-promote to Tier 3. The planner (Haiku) can escalate if needed.
- Rule-based Tier 3 remains for: ticket assigned to agent, urgent/high priority tickets.
-->

### Planner inputs

- structured context packet (from context builder),
- available actions (from action registry, filtered by scope and permissions),
- policy constraints (autonomy mode, risk thresholds),
- tier-specific token budget.

### Multi-turn execution model

<!-- Added after multi-turn agentic loop implementation -->

The pipeline operates in an **iterative loop of up to 10 turns**, not a single-shot call:

1. Build context and system prompt (once, before the loop)
2. **Loop** (turn 1..10): call planner → enforce policy → execute/suggest → feed results back as `tool_result`
3. The planner sees execution results and decides what to do next
4. Loop ends when: planner sets `done=true`, returns `ignore`, disposition is `escalate` on turn >1, or hard cap is hit

Key properties:
- **Context built once** — no DB re-queries mid-loop. Fresh info comes via tool_result observations.
- **Cost aggregated** — single cost entry at end, not per-iteration.
- **Tier 3 promotion only on turn 1** — if the planner escalates on a later turn, the loop terminates.
- **Hard cap of 10** — enforced in pipeline code, not by the LLM. The LLM is told "Turn N of 10" for awareness.
- **`done` field is a stop hint** — the pipeline respects it but doesn't require it. Missing `done` = `false` (continue).
- **@mention replies are forced deterministically** — if the trigger is an @mention and no `message.send` was executed across all turns, the pipeline forces a fallback reply. Threading (`parentId`) is also injected by code, not the LLM.

### Planner outputs

Strictly structured action plans:

```ts
interface PlannedAgentDecision {
  disposition: "ignore" | "suggest" | "act" | "summarize" | "escalate";
  confidence: number;
  rationaleSummary: string;
  proposedActions: Array<{
    actionType: string;
    args: Record<string, unknown>;
  }>;
  userVisibleMessage?: string;
  followUpAfterMs?: number;
  promotionReason?: string;
  promotionTarget?: "sonnet" | "opus"; // which model to escalate to (default: "sonnet")
  done?: boolean; // signal the multi-turn loop to stop
}
```

### Planner principles

- Generate structured JSON, not free-form prose.
- Do not let the model invent action names. It picks from the registered action set.
- Provide explicit tool/action schema derived from the action registry.
- Make "do nothing" a valid and common output.
- The system prompt must heavily emphasize that `no_op` is a good and common choice: "Most events require no action. Only act when you have high confidence that the action will be useful to the team. When uncertain, choose no_op."

### Example planner decisions

- ignore a casual conversation,
- suggest ticket creation from a bug report thread,
- link a new conversation to an existing ticket,
- create a follow-up comment on a ticket,
- start a coding session for an agent-assigned ticket,
- summarize a burst of session events,
- escalate to a human when blocked.

### Model prompts should include

- **soul file** (resolved from org + project + repo sources — see Section 9.6.1),
- event type and batch context,
- current scope entity state,
- linked entities (with hop distance),
- recent summary (with freshness indicator),
- allowed actions (from registry, filtered for scope),
- policy mode and confidence guidance,
- explicit instruction to prefer no-op when uncertain,
- concise structured output schema.

### 9.6.1 Soul File Integration

The soul file replaces the generic "org-specific preferences" concept with a concrete, user-editable identity document that shapes every planner decision.

**What it is.** A structured markdown document per organization that defines the agent's personality, tone, domain expertise, priorities, and behavioral rules. It is the primary lever for organizations to customize agent behavior without touching code.

**Loading order.** The context builder assembles the soul from multiple sources:

1. **Platform default** — Built-in baseline. Conservative, generic, professional. Always present as fallback.
2. **Organization soul** — Stored in `OrgAgentSettings.soulFile`. Overrides platform default. Editable by admins in settings UI.
3. **Project-level overrides** (optional) — A project can add or modify rules for its scope.
4. **Repo-level `.trace/soul.md`** (optional) — Merged into context for any event involving that repo.

More specific sources override less specific ones.

**Prompt positioning.** The resolved soul file is injected into the planner system prompt after the action schema and before the event context:

```
[System prompt preamble]
[Action schema — what you can do]
[Soul file — who you are and how to behave]
[Context packet — what happened]
[Output schema — how to respond]
```

This ordering ensures the planner knows its capabilities (actions) and identity (soul) before seeing the specific situation it needs to reason about.

**Token budget.** The soul file gets a dedicated allocation in the token budget (default: 2000 tokens). If it exceeds budget, it is truncated from the bottom — identity and personality sections at the top are preserved, detailed behavioral rules at the bottom are trimmed.

**Example soul file:**

```markdown
# Agent Soul — Acme Payments

## Identity
You are the ambient AI assistant for Acme Payments. You are a member of the engineering team.

## Personality & Tone
- Be direct and concise. No filler.
- Use technical language appropriate for senior engineers.
- When uncertain, say so explicitly.

## Domain Context
- We build a fintech payments platform processing real money.
- Correctness > speed. When in doubt, suggest rather than act.
- Stack: Go backend, React frontend, PostgreSQL, AWS EKS.

## Priorities
1. Production incidents — always urgent, always immediate.
2. Security discussions — flag and suggest tickets immediately.
3. Performance regressions — investigate and link to sessions.

## Behavioral Rules
- Never auto-assign tickets. Always suggest.
- Never post in #announcements without approval.
- For bug reports, default to "high" priority.
- Suppress suggestions in #watercooler and #random.
```

**Schema:**

```ts
interface OrgAgentSettings {
  aiEnabled: boolean;
  autonomyMode: "observe" | "suggest" | "act";
  soulFile: string;         // markdown content
  modelTier: "default" | "custom";
  costBudget: {
    dailyLimitCents: number;
    currentUsageCents: number;
  };
  customPreferences: Record<string, unknown>;
}
```

The `customPreferences` field in the existing `AgentOrgContext` (Section 5) is superseded by `soulFile` for behavioral configuration. `customPreferences` can remain for machine-readable settings (thresholds, feature flags) that don't belong in a prose document.

---

## 9.7 Policy Engine

This layer prevents the AI from being annoying, dangerous, or overly confident. It also implements **confidence-based routing** between execution, suggestion, and dropping.

### Confidence-based action routing

The policy engine uses the action's `risk` level (from the registry), the planner's confidence score, and the scope's autonomy mode to decide what happens:

```ts
class PolicyEngine {
  evaluate(action: PlannedAction, confidence: number, context: AgentContext): PolicyDecision {
    const registration = actionRegistry.find(action.name);
    const scopeMode = context.permissions.autonomyMode;

    // Hard blocks
    if (scopeMode === "observe") return { disposition: "drop" };
    if (registration.blocked) return { disposition: "drop" };

    const thresholds = this.getThresholds(registration.risk, scopeMode);

    if (confidence >= thresholds.act) {
      return { disposition: "execute", action };
    }

    if (confidence >= thresholds.suggest && registration.suggestable) {
      return { disposition: "suggest", action };
    }

    return { disposition: "drop" };
  }

  private getThresholds(risk: string, mode: string) {
    const matrix = {
      low: { suggest: { suggest: 0.3, act: 0.6 }, act: { suggest: 0.2, act: 0.4 } },
      medium: { suggest: { suggest: 0.5, act: 0.9 }, act: { suggest: 0.3, act: 0.7 } },
      high: { suggest: { suggest: 0.6, act: 0.95 }, act: { suggest: 0.5, act: 0.85 } },
    };
    return matrix[risk][mode];
  }
}
```

These threshold values are tunable per org. Start conservative and adjust based on acceptance rates.

### Responsibilities

- enforce permissions,
- cap autonomy based on scope settings,
- block restricted actions,
- route by confidence: execute / suggest / drop,
- prevent duplication (semantic deduplication),
- prevent loops,
- enforce rate limits,
- enforce cost budgets,
- route some actions to approval workflows.

### Core rules

- AI can only do what the service layer and permissions allow.
- Public user-visible actions should be more restricted than silent enrichment.
- Ticket closure, assignment changes, destructive changes, and broad notifications should be harder than enrichment or suggestions.
- The AI should never message everywhere just because it can see everything.

### Default risk levels (from action registry)

| Action                  | Risk    | Suggestable | Notes                                       |
| ----------------------- | ------- | ----------- | ------------------------------------------- |
| update internal summary | low     | no          | silent internal action, just do it or don't |
| link entities           | low     | yes         | usually safe                                |
| suggest create ticket   | low     | no          | creates InboxItem, not real ticket          |
| comment on ticket       | medium  | yes         | user-visible but bounded                    |
| send channel message    | medium  | yes         | user-visible, depends on confidence         |
| create ticket           | medium  | yes         | creates real artifact                       |
| update ticket fields    | medium  | yes         | modifies existing artifact                  |
| assign ticket           | high    | yes         | avoid silent reassignment in v1             |
| start session           | high    | yes         | resource-intensive, cost-generating         |
| close ticket            | blocked | —           | require explicit human approval             |

### Semantic deduplication

Before creating a suggestion, check existing open suggestions in the same scope for overlap. If a user discusses a bug at 9am and again at 3pm, the event IDs differ but the agent shouldn't suggest two tickets for the same issue.

**v1 implementation:** simple title similarity check (Levenshtein distance or trigram overlap) against open InboxItems of the same type in the same scope. No vector store needed.

**Later:** embedding similarity check when semantic retrieval is available.

### Suggestion expiry

Suggestions that are neither accepted nor dismissed should expire:

- Ticket suggestions: expire after 72 hours.
- Link suggestions: expire after 48 hours.
- Session suggestions: expire after 24 hours.
- Metadata change suggestions: expire after 48 hours.

Expiry is implemented as a background job that transitions `InboxItem.status` to a resolved state.

### Required anti-chaos mechanisms

- idempotency keys,
- semantic duplicate detection,
- cooldown windows per scope (no more than N suggestions per scope per hour),
- suppression memory ("user dismissed this suggestion type in this scope recently"),
- self-event suppression,
- org-level AI mode flags,
- cost budget enforcement.

---

## 9.8 Action Registry and Executor

The model never gets raw access to your services. Instead, the existing service layer is exposed through a **reflective action registry** — a metadata layer that describes service methods to the AI and maps model outputs to real service calls.

### Action Registry

The registry describes each available action with its schema, risk level, and mapping to a service method:

```ts
interface AgentActionRegistration {
  name: string; // e.g., "ticket.create"
  service: string; // e.g., "ticketService"
  method: string; // e.g., "create"
  description: string; // used in planner prompt
  risk: "low" | "medium" | "high"; // drives confidence thresholds
  suggestable: boolean; // can be turned into an InboxItem?
  parameters: ZodSchema | JSONSchema; // reuse existing validation schemas
  scopes?: string[]; // which scope types can trigger this
  requiredPermissions?: string[]; // agent must have these grants
}

const agentActionRegistry: AgentActionRegistration[] = [
  {
    name: "ticket.create",
    service: "ticketService",
    method: "create",
    description: "Create a new ticket",
    risk: "medium",
    suggestable: true,
    parameters: CreateTicketInputSchema,
  },
  {
    name: "ticket.update",
    service: "ticketService",
    method: "update",
    description: "Update ticket fields like status, priority, labels, assignees",
    risk: "medium",
    suggestable: true,
    parameters: UpdateTicketInputSchema,
  },
  {
    name: "ticket.addComment",
    service: "commentService",
    method: "add",
    description: "Add a comment to a ticket",
    risk: "medium",
    suggestable: true,
    parameters: AddCommentInputSchema,
  },
  {
    name: "message.send",
    service: "messageService",
    method: "send",
    description: "Send a message in a channel",
    risk: "medium",
    suggestable: true,
    parameters: SendMessageInputSchema,
  },
  {
    name: "session.start",
    service: "sessionService",
    method: "start",
    description: "Start a new coding session",
    risk: "high",
    suggestable: true,
    parameters: StartSessionInputSchema,
  },
  {
    name: "link.create",
    service: "linkService",
    method: "create",
    description: "Link two entities together",
    risk: "low",
    suggestable: true,
    parameters: CreateLinkInputSchema,
  },
  {
    name: "summary.update",
    service: "summaryService",
    method: "upsert",
    description: "Update or create a rolling summary for an entity",
    risk: "low",
    suggestable: false,
    parameters: UpsertSummaryInputSchema,
  },
  {
    name: "no_op",
    service: "",
    method: "",
    description: "Do nothing. Most events require no action. Choose this when uncertain.",
    risk: "low",
    suggestable: false,
    parameters: EmptySchema,
  },
];
```

### Generic Executor

The executor maps approved action plans to real service calls. It is the **only place** where the AI runtime mutates product state, and it does so only through the existing service layer.

```ts
class ActionExecutor {
  constructor(private services: ServiceContainer) {}

  async execute(action: PlannedAction, context: AgentContext): Promise<ActionResult> {
    if (action.name === "no_op") return { status: "success" };

    const registration = agentActionRegistry.find((a) => a.name === action.name);
    if (!registration) throw new UnknownActionError(action.name);

    const service = this.services[registration.service];
    const method = service[registration.method];

    // Inject agent identity into every call
    const input = {
      ...action.args,
      organizationId: context.organizationId,
      actorType: "agent" as const,
      actorId: context.agentId,
    };

    // Idempotency
    const idempotencyKey = this.buildIdempotencyKey(action, context);

    try {
      const result = await method.call(service, { ...input, idempotencyKey });
      return { status: "success", result };
    } catch (error) {
      return { status: "failed", error };
    }
  }

  private buildIdempotencyKey(action: PlannedAction, context: AgentContext): string {
    return `agent:${context.agentId}:${action.name}:${context.triggerEvent.id}`;
  }
}
```

### Adding new AI-accessible capabilities

Adding a new capability the AI can use requires exactly one step: add an entry to the action registry. The service method already exists. The registry entry provides the metadata the AI needs (name, description, schema) and the executor needs (service, method, risk level).

### The executor must never

- write directly to DB tables,
- fabricate event rows,
- bypass validation,
- bypass authorization,
- or directly manipulate read-model projections.

---

## 9.9 Suggestion Delivery via InboxItem

Suggestions use the existing `InboxItem` model rather than a separate entity. This reuses the existing rendering surface, notification pipeline, and read/unread state.

### Mapping suggestions to InboxItem

```ts
// When policy disposition is "suggest":
async function createSuggestion(
  action: PlannedAction,
  plan: PlannedAgentDecision,
  context: AgentContext,
): Promise<InboxItem> {
  return inboxService.create({
    itemType: mapActionToInboxType(action.name),
    status: "active",
    title: plan.userVisibleMessage || generateSuggestionTitle(action),
    summary: plan.rationaleSummary,
    payload: {
      action: action, // the full action, ready to execute on accept
      confidence: plan.confidence,
      triggerEventId: context.triggerEvent.id,
      agentId: context.agentId,
      expiresAt: calculateExpiry(action.name),
    },
    userId: determineTargetUser(context),
    organizationId: context.organizationId,
    sourceType: "event",
    sourceId: context.triggerEvent.id,
  });
}

function mapActionToInboxType(actionName: string): InboxItemType {
  const mapping: Record<string, InboxItemType> = {
    "ticket.create": "ticket_suggestion",
    "link.create": "link_suggestion",
    "session.start": "session_suggestion",
    "ticket.update": "field_change_suggestion",
    "ticket.addComment": "comment_suggestion",
    "message.send": "message_suggestion",
  };
  return mapping[actionName] || "agent_suggestion";
}
```

### Accepting a suggestion

When a user accepts a suggestion from their inbox, execute the stored action:

```ts
async function acceptSuggestion(
  inboxItemId: string,
  edits?: Record<string, unknown>,
): Promise<void> {
  const item = await inboxService.get(inboxItemId);
  const action = item.payload.action;

  // User might have edited the suggestion before accepting
  if (edits) {
    Object.assign(action.args, edits);
  }

  // Execute the same action that would have run automatically
  await executor.execute(action, {
    organizationId: item.organizationId,
    agentId: item.payload.agentId,
    actorType: "agent",
    triggerEvent: { id: item.payload.triggerEventId },
  });

  await inboxService.resolve(inboxItemId, "accepted");
}
```

### Suggestion rendering

Suggestions surface in two places:

- **Inbox:** the InboxItem is the notification/tracking mechanism. Users see it in their inbox list and can accept, edit, or dismiss.
- **Inline (optional):** for channel-scoped suggestions, a lightweight card can render inline in the thread, referencing the same underlying InboxItem. The inline card is a projection — the InboxItem is the source of truth for status.

### Feedback loop

Suggestion outcomes are one of the best training signals:

- `accepted` — agent was right, action was useful.
- `edited then accepted` — agent had the right idea but wrong details.
- `dismissed` — agent was wrong or unhelpful.
- `expired` — agent's suggestion was ignored entirely.
- `repeated dismissal` — user keeps dismissing this type of suggestion in this scope; suppress future ones.

All outcomes are recorded in the agent execution log for evaluation.

---

## 9.10 Cost Tracker

Inference costs scale with organizational activity. Without explicit cost management, a busy org can burn through significant model spend.

### Per-org cost tracking

```ts
interface OrgCostState {
  organizationId: string;
  dailyLimitCents: number;
  currentDailyUsageCents: number;
  lastResetAt: string; // resets daily
}
```

### Cost recording

Every planner call records:

- model used (tier),
- input tokens,
- output tokens,
- estimated cost in cents.

### Budget enforcement

The router checks the org's remaining budget before forwarding events:

- Budget remaining > 50%: normal operation.
- Budget remaining 10-50%: downgrade Tier 3 promotions to Tier 2.
- Budget remaining < 10%: observe-only mode (summaries and memory still update, but no suggestions or actions).
- Budget exhausted: drop all events (log only).

### Reporting

Surface cost data in the org settings dashboard:

- daily/weekly/monthly inference spend,
- breakdown by tier,
- breakdown by action type,
- cost per suggestion (accepted vs. dismissed).

---

## 9.11 Telemetry, Evaluation, and Feedback

This is mandatory, not optional.

### Capture for every planner run

- triggering event ID,
- event batch size (if aggregated),
- context packet token allocation,
- summary freshness status,
- LLM tier used,
- promotion (if any) and reason,
- latency,
- token counts (input + output),
- estimated cost,
- planned decision,
- policy modifications (downgrade/block),
- final action result,
- user response if any.

### Capture for suggestions (via InboxItem)

- accepted,
- edited before accept (and what was edited),
- dismissed,
- expired,
- repeated suppression.

### Capture for actions

- succeeded,
- failed validation,
- failed permission,
- failed service call,
- reverted,
- human-overridden.

### Evaluation goals

- suggestion acceptance rate (primary quality signal),
- edit-before-accept rate (agent had right idea, wrong details),
- duplicate suggestion rate,
- false positive rate,
- action success rate,
- perceived spamminess (dismissal + suppression rate),
- time-to-help after relevant event,
- cost per useful action,
- cost per org per day.

---

## 10. Integration with Existing Trace Concepts

## 10.1 Channels

Channels are the main surface for proactive observation.

### AI responsibilities in channels

- detect bug reports, feature requests, blockers, and decisions,
- suggest or create tickets,
- find related historical work,
- summarize threads,
- propose starting sessions,
- answer contextual questions when mentioned.

### Suggested v1 actions

- suggest ticket creation (via InboxItem),
- suggest linking to existing ticket (via InboxItem),
- post concise research summary when directly asked or strongly relevant,
- create internal memory summary of thread (silent enrichment).

### Recommended constraints

- default to suggestions over autonomous public posting,
- avoid posting on every message (aggregator handles batching),
- suppress repeated nudges in the same thread,
- cooldown: maximum 2 suggestions per thread per hour.

---

## 10.2 DMs and Group Chats

DMs and group chats are private conversational spaces. Unlike channels (which are team-visible and always observable), chats require explicit agent membership before the AI can observe or participate.

### Privacy model: opt-in via membership

The agent only observes chats where it has been explicitly added as a member. This mirrors how bots work in Slack — adding the agent is consent.

- **DMs:** A user starts a DM with the agent. The agent is a `ChatMember` with `type = "dm"`. This is a direct, private conversation.
- **Group chats:** A user adds the agent to a group chat. The agent is a `ChatMember` with `type = "group"`. The agent can observe and participate in the group conversation.
- **No membership = no observation.** The router drops all chat-scoped events where the agent is not an active member. No silent surveillance.

### Adding the agent to a chat

Uses the existing `ChatMember` model — the agent is added like any other user:

```ts
// User adds the AI to a group chat or starts a DM
await chatService.addMember({
  chatId: 'chat_xyz',
  userId: agentId,            // per-org agent identity
  organizationId: orgId,
  actorType: 'user',
  actorId: invitingUserId,
});
// Emits: chat.member_added event
// Agent runtime registers this chat for observation
```

Removing the agent (`chat.member_removed`) immediately stops all observation and processing for that chat.

### Default autonomy modes by chat type

DMs and group chats have different proactivity defaults. DMs carry a stronger expectation of privacy and user control.

```ts
function getEffectiveAutonomyMode(scope: Scope, orgDefault: string): string {
  // Explicit scope override always takes precedence
  if (scope.aiMode) return scope.aiMode;

  if (scope.type === 'chat') {
    // DMs: respond when asked, don't volunteer
    if (scope.entity.chatType === 'dm') return 'observe';
    // Group chats: can suggest, similar to channels but less aggressive
    if (scope.entity.chatType === 'group') return 'suggest';
  }

  return orgDefault;
}
```

### AI behavior by chat type

| Behavior | Channel | Group Chat | DM |
|---|---|---|---|
| Observe silently | Always | If member | If member |
| Suggest tickets (InboxItem) | Yes | Yes | Only if asked |
| Post messages | Via suggestion or @mention | Via suggestion or @mention | Only when @mentioned or directly asked |
| Summarize | Rolling summaries | Rolling summaries | Only on explicit request |
| Proactive suggestions | Normal | Reduced — suggest mode | Minimal — observe mode by default |
| Link entities | Autonomous (low risk) | Via suggestion | Only if asked |

### AI responsibilities in DMs

DMs with the agent are essentially a **direct conversation with the AI**. The agent should:

- respond to questions with full context from the org (tickets, sessions, channels it has access to),
- perform actions the user requests (create tickets, look up information, summarize work),
- treat DM conversation as a private command interface — the user is explicitly talking to the agent.

When a user DMs the agent, bypass aggregation and respond promptly (Path D: explicit request path).

### AI responsibilities in group chats

Group chats where the agent is a member should behave like a quieter version of channels:

- detect actionable discussions (bugs, blockers, decisions) and suggest tickets via InboxItem,
- respond when @mentioned with contextual information,
- create internal summaries (silent enrichment),
- avoid interrupting casual conversation — higher threshold for proactive suggestions than channels.

### Recommended constraints

- DMs: no unsolicited suggestions, no proactive posting, respond only when addressed,
- Group chats: maximum 1 suggestion per hour (vs 2 per hour for channels),
- Never share DM content in other contexts (channel summaries, ticket comments, etc.),
- Agent's chat membership list is visible to org admins for auditability.

### Context building for chats

The context builder handles chats the same way as channels, with one addition — it includes the chat member list and chat type so the planner knows the privacy context:

```ts
// In context builder for chat-scoped events
const chat = await services.chat.getById(event.scopeId);
const members = await services.chat.getMembers(event.scopeId);

const scopeEntity = {
  ...chat,
  chatType: chat.type,       // 'dm' or 'group'
  memberCount: members.length,
  members: members.map(m => ({ id: m.userId, name: m.user.name })),
};
```

This lets the planner adjust its behavior: more responsive in DMs, more conservative in group chats.

---

## 10.3 Tickets

Tickets are derived state but still a primary working surface.

### AI responsibilities in tickets

- answer comments with contextual information,
- enrich descriptions and metadata,
- suggest assignees/labels/priority,
- detect duplicates/dependencies,
- start sessions for agent-owned tickets,
- post progress updates from sessions.

### Suggested v1 actions

- comment on ticket when mentioned (act if confidence high, suggest otherwise),
- suggest field changes (via InboxItem),
- link ticket to related thread/session (act — low risk),
- start session for explicit agent assignment (act — agent-owned),
- summarize ongoing progress (silent enrichment).

---

## 10.4 Sessions

Sessions are where autonomous work becomes tangible.

### AI responsibilities in sessions

- monitor task execution,
- summarize progress,
- detect blockages,
- notify linked ticket/channel,
- ask for human input when needed,
- associate session output with the right entities.

### Important distinction

The ambient AI is not the same thing as the coding tool running inside a session.

The ambient AI:

- observes the broader system,
- manages orchestration,
- decides when to start or connect work,
- summarizes and routes outcomes.

The session tool:

- performs local task execution,
- writes code,
- runs tests,
- generates file-level events.

### v1 interaction model

- ambient AI watches session lifecycle events,
- when a session is linked to a ticket, it can update the ticket (silent enrichment),
- when a session is blocked, it can ask humans for help (via InboxItem or direct comment),
- when a session completes, it can summarize outcomes.

---

## 10.5 Projects and Repos

Projects and repos provide structural context.

### AI should use them for

- scoping retrieval,
- finding similar work,
- determining relevant code ownership or nearby tickets,
- grouping work under initiative context,
- understanding which repo a session should use.

### v1 recommendation

Use project and repo metadata in context building but do not make them the direct target of many proactive actions initially.

---

## 11. Operating Modes

Do not think of the AI as a single monolithic behavior. Implement it in layered modes.

## 11.1 Observe mode

Always on.

Behavior:

- read events,
- update memory,
- compute summaries,
- detect possible opportunities,
- stay silent.

## 11.2 Suggest mode

Default user-visible proactive mode.

Behavior:

- propose creating tickets (via InboxItem),
- propose linking work (via InboxItem),
- propose next steps,
- ask before taking externally visible action.

## 11.3 Act mode

Higher-trust mode.

Behavior:

- perform silent enrichment,
- create certain low-risk artifacts directly,
- start sessions for explicitly agent-owned tasks,
- post bounded progress updates.

### Recommendation for v1

Default most spaces to:

- observe + suggest
- act only for silent enrichment (summaries, links) and explicit agent-owned tickets/sessions

### Mode configuration

Modes are configurable at:

- org level (global default),
- project level (override for a project),
- channel level (override for a channel),
- ticket level (override for a ticket).

More specific overrides take precedence. A channel set to "observe" stays observe-only even if the org default is "act."

---

## 12. Permissions and Identity

The AI must be represented as one or more concrete actors.

### Recommended model

Create explicit per-org agent identities:

- `agent_{orgId}_ambient` — the default ambient agent for each org.
- Optionally later: specialized agents per org or per project.

### Service call contract

All service calls from AI must include:

- `actorType: "agent"`
- `actorId: <org-scoped-agent-id>`
- `organizationId`
- idempotency key
- trace metadata

### Permissions

Use the same permission system as users, but allow org-specific AI grants.

Suggested permission buckets:

- read-all-within-org scope,
- create suggestions (InboxItems),
- create tickets,
- comment in channels/tickets,
- manage sessions,
- modify ticket fields,
- administrative actions (generally off).

### Recommendation

Model AI permissions as explicit capability grants rather than implicit superuser behavior. The action registry's `requiredPermissions` field should cross-reference the agent's grants.

---

## 13. Recommended v1 Feature Set

Build the smallest coherent proactive assistant first.

### v1 features

1. Ticket suggestion from channel/thread messages (via InboxItem).
2. Related-ticket suggestion from new conversations (via InboxItem).
3. Ticket comment assistance when users @mention the agent.
4. Session monitoring summaries for agent-owned or linked sessions.
5. Cross-entity linking suggestions (via InboxItem).
6. Rolling summaries for channels, tickets, and sessions.
7. Internal retrieval over recent events + linked entities + summaries (no vector store).

### Explicitly defer

- Semantic retrieval / vector search (Phase 2),
- Broad autonomous public posting everywhere,
- Autonomous reassignment/closure of tickets,
- Org-wide always-on research spam,
- Self-directed long-running projects without explicit ticket ownership,
- Fully autonomous planning across unrelated scopes.

---

## 14. Data Model Additions

The core Trace model and existing `InboxItem` can support the AI. Add the following tables/entities.

## 14.1 InboxItem extensions

The existing `InboxItem` model supports suggestions natively. Extend the `InboxItemType` enum to include agent suggestion types:

```ts
// Additional InboxItemType values
type AgentInboxItemTypes =
  | "ticket_suggestion"
  | "link_suggestion"
  | "session_suggestion"
  | "field_change_suggestion"
  | "comment_suggestion"
  | "message_suggestion"
  | "agent_suggestion"; // generic fallback
```

The `payload` JSON field carries the proposed action, confidence, trigger event ID, agent ID, and expiry timestamp. No schema changes needed — just new enum values and a defined payload shape.

## 14.2 Entity summary / memory

```ts
interface EntitySummary {
  id: string;
  organizationId: string;
  entityType: "channel" | "chat" | "ticket" | "session" | "project" | "repo";
  entityId: string;
  summaryType: "rolling" | "milestone" | "incident" | "snapshot";
  text: string;
  sourceEventRange: {
    startEventId: string;
    endEventId: string;
    eventCount: number;
  };
  isFresh: boolean; // computed: is this within freshness threshold?
  createdAt: string;
  updatedAt: string;
}
```

Index: `(organizationId, entityType, entityId, summaryType)`

## 14.3 Agent execution log

```ts
interface AgentExecutionLog {
  id: string;
  organizationId: string;
  triggerEventId: string;
  batchSize: number; // how many events were in the aggregated batch
  agentId: string;
  modelTier: "tier2" | "tier3";
  model: string; // specific model identifier
  promoted: boolean; // was this promoted from Tier 2?
  promotionReason?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  contextTokenAllocation: Record<string, number>;
  disposition: string;
  confidence: number;
  plannedActions: Array<Record<string, unknown>>;
  policyDecision: {
    disposition: "execute" | "suggest" | "drop" | "block";
    reason?: string;
  };
  finalActions: Array<Record<string, unknown>>;
  status: "succeeded" | "suggested" | "blocked" | "dropped" | "failed";
  inboxItemId?: string; // if a suggestion was created
  latencyMs: number;
  createdAt: string;
}
```

Index: `(organizationId, createdAt)`, `(organizationId, agentId, status)`, `(triggerEventId)`

## 14.4 Processed event / dedupe state

```ts
interface ProcessedAgentEvent {
  consumerName: string;
  eventId: string;
  organizationId: string;
  processedAt: string;
  resultHash?: string;
}
```

Index: `(consumerName, eventId)`, `(organizationId, processedAt)`

## 14.5 Org cost tracking

```ts
interface AgentCostTracker {
  organizationId: string;
  date: string; // YYYY-MM-DD
  totalCostCents: number;
  tier2Calls: number;
  tier2CostCents: number;
  tier3Calls: number;
  tier3CostCents: number;
  summaryCalls: number;
  summaryCostCents: number;
  updatedAt: string;
}
```

Index: `(organizationId, date)`

---

## 15. Action and Tool Contract

The model chooses from the action registry. The registry is generated from existing service method schemas.

### Initial registered actions

- `ticket.create`
- `ticket.update`
- `ticket.addComment`
- `message.send`
- `link.create`
- `session.start`
- `session.pause`
- `session.resume`
- `summary.update`
- `escalate.toHuman`
- `no_op`

### For each registered action, the registry defines

- name and description (used in planner prompt),
- service and method mapping (used by executor),
- parameter schema (reused from existing service validation),
- risk level (used by policy engine),
- suggestable flag (can this become an InboxItem?),
- allowed scopes,
- required permissions,
- idempotency strategy.

### Adding new actions

Adding a new AI-accessible capability requires one step: add an entry to the action registry. The service method already exists. No duplication of the service layer.

---

## 16. Request Path Design

The AI should not be invoked the same way for every event.

### Path A: Silent enrichment path

Used for:

- updating summaries,
- writing memory,
- logging possible links.

Usually no user-visible output. Uses Tier 2 model for summarization. Low risk, always permitted in suggest or act mode.

### Path B: Suggestion path

Used for:

- create-ticket suggestions,
- related-ticket suggestions,
- suggest start-session,
- suggest metadata changes.

User-visible via InboxItem but low-risk. Uses Tier 2 model. Confidence above suggest threshold but below act threshold.

### Path C: Autonomous execution path

Used only when policy allows and confidence is above act threshold:

- start agent-owned session,
- create internal links,
- update summary entities,
- maybe create ticket in trusted spaces later.

### Path D: Mention / explicit request path

Used when a user explicitly invokes the agent.

This should generally use Tier 3 (or at minimum Tier 2 with higher token budget) and allow richer reasoning and stronger confidence thresholds because the user explicitly asked. Bypasses aggregation — respond promptly.

---

## 17. Example End-to-End Scenarios

## 17.1 Message -> ticket suggestion

1. User posts in channel: "login keeps failing for invited users after password reset."
2. `message.sent` event is emitted.
3. Router classifies as potentially actionable, forwards to aggregator.
4. Two more users reply in the thread over the next 45 seconds.
5. Aggregator window closes after 30 seconds of silence (3 events batched).
6. Context builder fetches recent thread, linked project, nearby open tickets. Assembles within 8000-token budget.
7. Tier 2 planner sees the batch and decides `ticket.create` with confidence 0.72.
8. Policy engine: risk is "medium," autonomy mode is "suggest," threshold for act is 0.9. Confidence 0.72 > suggest threshold of 0.5. Disposition: **suggest**.
9. Executor creates InboxItem of type `ticket_suggestion` with pre-filled title, description, labels.
10. User sees suggestion in inbox, edits the title, accepts.
11. `acceptSuggestion` executes `ticketService.create(...)` with edited args.
12. Ticket is created, linked to source events. Execution log records accepted outcome.

## 17.2 Ticket assigned to agent -> session start

1. User assigns ticket to ambient agent.
2. `ticket.assigned` event emitted.
3. Router sees explicit agent ownership — bypasses aggregation, sends directly to planner.
4. Router selects Tier 3 (high-stakes: explicit agent assignment).
5. Context builder fetches ticket, linked repo, project, recent discussion. Uses 64000-token budget.
6. Tier 3 planner decides `session.start` with confidence 0.92.
7. Policy allows because ticket is explicitly agent-owned and confidence exceeds act threshold.
8. Executor calls `sessionService.start(...)`.
9. Session starts and emits events.
10. Agent monitors session and periodically summarizes progress to the ticket.

## 17.3 Session blocked -> escalation

1. Session emits `session.status_changed = needs_input`.
2. Router sends directly to planner (bypasses aggregation — status change is discrete).
3. Context builder fetches linked ticket/channel and latest session summary.
4. Tier 2 planner decides `escalate.toHuman` + `ticket.addComment`.
5. Policy permits comment (confidence is high for explicit blockage).
6. Executor posts concise clarification request as ticket comment.
7. InboxItem created for the ticket assignee flagging the blocked session.

## 17.4 DM with agent -> direct action

1. User opens a DM with the agent and sends: "what's the status of TK-142?"
2. `message.sent` event in `chat:chat_dm_xyz` scope.
3. Router checks membership — agent is a member of this DM. Chat type is `dm`, so this is a direct conversation.
4. Router bypasses aggregation (DM to agent = explicit request path).
5. Context builder fetches TK-142 (ticket entity), linked session sess_044, recent ticket events, and rolling summary.
6. Tier 2 planner (or Tier 3 if complex) sees the direct question and assembles a response.
7. Planner decides `message.send` with confidence 0.95 — user explicitly asked in a DM.
8. Policy allows: DM with agent, explicit question, high confidence.
9. Executor calls `chatService.sendMessage(...)` with a status summary of TK-142.
10. User sees the response in their DM thread.

## 17.5 Group chat discussion -> ticket suggestion

1. Agent is a member of a group chat with 4 engineers.
2. Three messages discuss a flaky integration test over 2 minutes.
3. Aggregator batches into a window, closes after 30s silence.
4. Planner sees the discussion and an open ticket TK-200 about test flakiness.
5. Planner decides: suggest linking the discussion to TK-200 (confidence 0.65).
6. Policy: group chat autonomy is "suggest," confidence above suggest threshold. Disposition: **suggest**.
7. InboxItem created for the group chat members suggesting the link.

## 17.6 Burst of channel activity -> summary only

1. A channel has 30 messages in 10 minutes discussing architecture options.
2. Aggregator batches events. Window closes at max wall-clock time (5 minutes), produces two batches.
3. Tier 2 planner reviews each batch. No single message warrants a ticket or action. Confidence for any action is below suggest threshold.
4. Disposition: **ignore** for proactive actions, but planner marks the scope for summary update.
5. Background summary worker refreshes the channel's rolling summary.
6. No user-visible output. Memory is updated for future context.

---

## 18. Idempotency, Ordering, and Failure Handling

This is critical.

### Requirements

- processing the same event twice must not create duplicate user-visible actions,
- action execution must be idempotent,
- failures must be retryable,
- long-running workflows must persist state externally,
- consumer crashes must not corrupt behavior.

### Idempotency key formula

`agent:{agentId}:{actionName}:{triggerEventId}`

This ensures the same event processed twice produces the same idempotency key and doesn't create duplicates.

### Semantic deduplication (beyond idempotency)

For suggestions, idempotency keys alone aren't sufficient. The same issue discussed at different times produces different event IDs. Before creating a suggestion:

1. Query open InboxItems in the same scope with the same `itemType`.
2. Compare title similarity (trigram overlap or Levenshtein distance).
3. If similarity exceeds threshold (e.g., 0.7), skip the duplicate suggestion.

### Additional safeguards

- store processed events per consumer,
- use cooldown windows for suggestions (max N per scope per hour),
- use org/scope locks or ordered partitions for sensitive event families,
- make suggestion creation and action execution separately idempotent.

### Loop prevention

Prevent the agent from repeatedly responding to its own outputs.

Rules:

- self-trigger suppression by default (router drops events where `actorId` matches agent),
- only allow re-processing agent events in explicitly defined cases (e.g., monitoring an agent-started session),
- mark derived actions with origin event IDs.

---

## 19. Observability and Developer Tooling

You will need internal tools to build this sanely.

### Build an agent debug console showing

- incoming events and router decisions,
- aggregation windows (active and closed),
- constructed context packets with token allocation breakdown,
- LLM tier selected and promotion decisions,
- planner outputs with confidence scores,
- policy modifications (downgrade/block/suggest),
- executed actions and resulting events,
- cost per decision.

### Build replay tooling

Ability to:

- replay a historical event (or event batch) through the planner,
- inspect retrieved context and token allocation,
- compare policy versions,
- simulate "what would the AI have done?"
- test different confidence thresholds against historical data.

### Build suppression/feedback tooling

Ability for humans/admins to:

- disable AI in a channel/project,
- lower or raise autonomy mode,
- suppress a recurring suggestion type,
- adjust confidence thresholds,
- view cost dashboard,
- inspect why an action happened (link to execution log).

---

## 20. Implementation Roadmap

## Phase 1: Foundation

- Create agent-worker service.
- Add durable event consumption.
- Add per-org agent identity and permission grants.
- Add action registry with initial service method mappings.
- Add generic action executor that calls service layer.
- Add processed event dedupe table.
- Add execution logs with cost tracking.
- Add org cost tracker.
- Add event router (deterministic, no LLM).

## Phase 2: Context and memory

- Implement context builder with token budget management.
- Implement bounded graph traversal (2-hop limit).
- Add rolling summaries for channels/tickets/sessions.
- Add summary freshness validation.
- Add summary write worker (background, async).
- Add event aggregator (windowed batching).

## Phase 3: First proactive behaviors

- Implement Tier 2 planner with structured output.
- Ticket suggestion from conversation (via InboxItem).
- Related-ticket suggestion (via InboxItem).
- Ticket comment assistance on explicit @mention.
- Session monitoring summary updates.
- Suggestion accept/dismiss flow through InboxItem.

## Phase 4: Controlled autonomy

- Implement Tier 3 planner and promotion system.
- Start sessions for agent-owned tickets.
- Post bounded progress updates.
- Silent linking/enrichment actions.
- Add per-org/project/channel autonomy settings.
- Add semantic deduplication for suggestions.
- Add suggestion expiry background job.

## Phase 5: Evaluation and refinement

- Acceptance/dismissal metrics dashboard.
- Spam suppression tuning (cooldowns, suppression memory).
- Better duplicate detection.
- Better confidence calibration using historical outcomes.
- A/B prompt and policy experiments.
- Cost optimization analysis (which events are worth processing?).

## Phase 6: Semantic retrieval (when needed)

- Add embeddings for messages, tickets, summaries.
- Add vector search scoped by organization.
- Add semantic retrieval to context builder (Layer 3).
- Add episodic memory (prior incidents, resolutions).
- Upgrade semantic deduplication to use embeddings.

---

## 21. Concrete Build Recommendations

If an implementation agent is starting now, it should do the following:

1. Add a new `agent-worker` process to the backend.
2. Define a durable event-consumer interface.
3. Implement `AgentRuntime` with submodules:
   - `EventConsumer`
   - `EventRouter` (deterministic code, no LLM)
   - `EventAggregator` (windowed batching)
   - `ContextBuilder` (with token budget management)
   - `MemoryService` (summaries, freshness validation)
   - `Planner` (tiered: Tier 2 default, Tier 3 on promotion)
   - `PolicyEngine` (confidence-based routing: execute/suggest/drop)
   - `ActionExecutor` (reflective service registry)
   - `CostTracker`
   - `AgentTelemetry`
4. Add DB tables for:
   - entity summaries (with freshness tracking),
   - agent execution logs (with cost data),
   - processed events,
   - org cost tracking.
5. Extend `InboxItem` enum with agent suggestion types.
6. Implement action registry mapping existing service methods.
7. Implement first registered actions:
   - `ticket.create`
   - `ticket.addComment`
   - `link.create`
   - `session.start`
   - `summary.update`
   - `no_op`
8. Implement first event handlers for:
   - `message.sent`
   - `comment.added`
   - `ticket.assigned`
   - `session.status_changed`
   - `tool.result`
9. Add per-org agent identity and settings.
10. Add policy config at org/project/channel/ticket level.
11. Build minimal internal debugging and replay tools.

---

## 22. Pseudocode Skeleton

```ts
class AgentRuntime {
  constructor(
    private consumer: EventConsumer,
    private router: EventRouter,
    private aggregator: EventAggregator,
    private contextBuilder: ContextBuilder,
    private planner: TieredPlanner,
    private policy: PolicyEngine,
    private executor: ActionExecutor,
    private inbox: InboxService,
    private costTracker: CostTracker,
    private telemetry: AgentTelemetry,
  ) {}

  async start() {
    await this.consumer.subscribe(async (event) => {
      // Load org context and check if AI is enabled
      const orgContext = await this.loadOrgContext(event.organizationId);
      if (!orgContext.orgSettings.aiEnabled) return;

      // Route: is this event worth processing?
      const route = await this.router.route(event, orgContext);
      if (route.disposition === "drop") return;

      // Check cost budget
      if (this.costTracker.isExhausted(orgContext)) {
        await this.telemetry.recordBudgetDrop(event, orgContext);
        return;
      }

      // Aggregate or process immediately
      if (route.disposition === "aggregate") {
        await this.aggregator.addToWindow(event, route.scopeKey, async (batch) => {
          await this.processBatch(batch, orgContext);
        });
      } else if (route.disposition === "immediate") {
        await this.processBatch([event], orgContext);
      }
    });
  }

  private async processBatch(events: DomainEvent[], orgContext: AgentOrgContext) {
    const triggerEvent = events[events.length - 1]; // most recent

    // Build context with token budget
    const tier = this.router.selectTier(triggerEvent, orgContext);
    const context = await this.contextBuilder.build({
      events,
      orgContext,
      tokenBudget: this.getTokenBudget(tier),
    });

    // Plan
    const plan = await this.planner.plan(context, tier);

    // Handle promotion
    if (plan.promotionReason && tier === "tier2") {
      const promotedContext = await this.contextBuilder.build({
        events,
        orgContext,
        tokenBudget: this.getTokenBudget("tier3"),
      });
      const promotedPlan = await this.planner.plan(promotedContext, "tier3");
      return this.executeDecision(promotedPlan, promotedContext, orgContext, true);
    }

    await this.executeDecision(plan, context, orgContext, false);
  }

  private async executeDecision(
    plan: PlannedAgentDecision,
    context: AgentContextPacket,
    orgContext: AgentOrgContext,
    promoted: boolean,
  ) {
    for (const action of plan.proposedActions) {
      const policyDecision = await this.policy.evaluate(action, plan.confidence, context);

      if (policyDecision.disposition === "execute") {
        const result = await this.executor.execute(action, context);
        await this.telemetry.recordExecution({
          context,
          plan,
          policyDecision,
          result,
          promoted,
        });
      } else if (policyDecision.disposition === "suggest") {
        const inboxItem = await this.createSuggestion(action, plan, context);
        await this.telemetry.recordSuggestion({
          context,
          plan,
          policyDecision,
          inboxItem,
          promoted,
        });
      } else {
        await this.telemetry.recordDrop({
          context,
          plan,
          policyDecision,
          promoted,
        });
      }
    }

    // Record cost
    await this.costTracker.recordUsage(orgContext, plan.tokenUsage);
  }
}
```

---

## 23. Final Architectural Rules

These rules should not be violated.

1. **The AI reads from events and writes through services.**
2. **The AI never writes directly to the database.**
3. **The AI never creates events directly.**
4. **GraphQL is not the AI integration surface.**
5. **The event stream is the source of truth; memory is a derived optimization.**
6. **Deterministic graph lookup comes before any other retrieval mechanism.**
7. **Suggestions via InboxItem are the default proactive UX, not autonomous mutation.**
8. **Every AI action must be auditable and attributable to a per-org agent identity.**
9. **"Do nothing" is a successful outcome and should be the most common one.**
10. **Start with narrow, useful, high-confidence behaviors before trying to make the AI omnipotent.**
11. **Organization isolation is absolute — no cross-org data access of any kind.**
12. **Every model call has a cost. Track it, budget it, enforce limits.**
13. **The action registry is the allowlist — if it's not registered, the AI can't do it.**
14. **Confidence determines the action path: execute, suggest, or drop. Never skip the policy engine.**

---

## 24. Short Hand-Off Prompt for Another AI

Use this if you want to hand the implementation off to another coding model:

> Build the Trace ambient AI runtime as a separate backend worker in the existing server codebase. The worker must subscribe to the durable domain event stream, batch related events using windowed aggregation, build event-scoped context using a token-budgeted context builder (linked entities with 2-hop max + recent events + rolling summaries with freshness validation), plan actions using a tiered LLM system (deterministic router → Tier 2 workhorse model → Tier 3 premium model with explicit promotion), enforce policy/autonomy constraints using confidence-based routing (execute above act threshold, suggest above suggest threshold, drop below), and execute actions only through the existing service layer via a reflective action registry that maps registered action names to service methods. Suggestions are delivered as InboxItems — the existing inbox model extended with agent suggestion types. Accepted suggestions execute the stored action through the same executor. The system is strictly org-isolated: every query, memory, summary, and execution log is partitioned by organizationId. Per-org agent identities, per-org cost budgets, and per-scope autonomy settings. Do not call GraphQL internally. Do not mutate DB tables directly. Do not use vector search in v1 — structured retrieval + summaries are sufficient. Implement v1 around ticket suggestions, cross-entity linking, ticket comment assistance, session monitoring summaries, and starting sessions for explicitly agent-assigned tickets. Add tables for entity summaries, agent execution logs, processed-event dedupe, and org cost tracking. Extend InboxItem types for agent suggestions. Preserve auditability, idempotency, and replayability. Track inference cost per org per day and enforce budget limits.
