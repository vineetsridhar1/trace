# AI Agent — Ticket Index

Tickets for building the ambient AI agent runtime. Work sequentially — each ticket builds on prior ones. The architecture is designed so channel messages (not yet built) can be plugged in later with minimal changes.

## Foundation

| # | Ticket | What it does |
|---|--------|-------------|
| 01 | [Redis Infrastructure](01-redis-infrastructure.md) | Add Redis, replace in-memory pub/sub, add durable event streams |
| 02 | [Agent Worker Process](02-agent-worker-process.md) | Separate entry point that consumes events from Redis Streams |
| 03 | [Agent Identity & Permissions](03-agent-identity-and-permissions.md) | Per-org agent identities and settings (aiEnabled, autonomyMode, soul file, cost budget) |

## Pipeline Components

| # | Ticket | What it does |
|---|--------|-------------|
| 04 | [Event Router](04-event-router.md) | Deterministic routing: drop, aggregate, or direct. Chat membership gate. No LLM |
| 05 | [Event Aggregator](05-event-aggregator.md) | Windowed batching by scope key. Silence timeout, max events, max wall clock |
| 06 | [Action Registry](06-action-registry.md) | Defines every action the agent can take. Maps to service methods |
| 07 | [Action Executor](07-action-executor.md) | Executes actions through the service layer with idempotency |
| 08 | [Execution Logging](08-execution-logging.md) | Logs every decision chain. Per-org cost tracking |
| 09 | [Entity Summaries](09-entity-summaries.md) | AI-generated rolling summaries for chats, tickets, sessions |
| 10 | [Context Builder](10-context-builder.md) | Assembles token-budgeted context packets with targeted retrieval |

## Intelligence Layer

| # | Ticket | What it does |
|---|--------|-------------|
| 11 | [Tier 2 Planner](11-tier2-planner.md) | Workhorse LLM decision engine. Structured output |
| 12 | [Policy Engine](12-policy-engine.md) | Confidence × risk × autonomy routing. Anti-chaos mechanisms |
| 13 | [Soul File](13-soul-file.md) | Per-org agent personality and behavioral rules |
| 14 | [Suggestion Delivery](14-suggestion-delivery.md) | Suggestions as InboxItems. Accept/edit/dismiss flow |

## Integration

| # | Ticket | What it does |
|---|--------|-------------|
| 15 | [Pipeline Integration](15-pipeline-integration.md) | Wire everything end-to-end. The big integration ticket |
| 16 | [Tier 3 Planner & Promotion](16-tier3-planner-and-promotion.md) | Premium model for high-stakes decisions. Promotion system |
| 17 | [Chat & DM Observation](17-chat-dm-observation.md) | DM direct replies, group chat suggestions, privacy guards |
| 18 | [Session Monitoring](18-session-monitoring.md) | Watch sessions, summarize progress, detect blockages |

## Polish & Extensibility

| # | Ticket | What it does |
|---|--------|-------------|
| 19 | [Semantic Dedup & Expiry](19-semantic-dedup-and-expiry.md) | Prevent duplicate suggestions. Auto-expire stale ones |
| 20 | [Per-Scope Autonomy](20-per-scope-autonomy-settings.md) | Autonomy overrides at chat, ticket, project, channel level |
| 21 | [Channel Message Adapter](21-channel-message-adapter.md) | Pre-wire for channel messages. Scope adapter pattern |
| 22 | [Agent Debug Console](22-agent-debug-console.md) | Internal UI for observing and debugging the pipeline |
| 23 | [Debug Event Feed](23-debug-event-feed.md) | Real-time event feed with routing decisions in the debug console |

## Dependency graph

```
01 Redis
└─ 02 Worker
   └─ 03 Identity
      ├─ 04 Router ──────────────────┐
      │  └─ 05 Aggregator            │
      │                              │
      ├─ 08 Execution Logging        │
      │                              │
      └─ 09 Entity Summaries         │
                                     │
06 Action Registry ──────────────────┤
└─ 07 Executor                       │
                                     │
10 Context Builder (needs 05,06,09) ─┤
                                     │
11 Planner (needs 06,10) ────────────┤
12 Policy Engine (needs 06,08) ──────┤
13 Soul File (needs 03,10) ──────────┤
14 Suggestion Delivery (needs 07,12) ┤
                                     │
15 Pipeline Integration (needs all) ─┘
├─ 16 Tier 3 Promotion
├─ 17 Chat & DM Observation
├─ 18 Session Monitoring
├─ 19 Semantic Dedup & Expiry
├─ 20 Per-Scope Autonomy
├─ 21 Channel Message Adapter
└─ 22 Agent Debug Console
   └─ 23 Debug Event Feed
```
