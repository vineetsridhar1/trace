# AI Conversations — Ticket Index

Tickets for building AI Conversations with branching conversation trees. Work sequentially by default, but treat the dependency notes below as the real source of truth when parallelizing. This index is aligned to [`plan.md`](../../plan.md): frontend work must use the feature-folder architecture, viewport-driven subscriptions, Zustand-owned shared state, and event-driven store updates.

## Implementation Guardrails

- Put frontend code under `apps/web/src/features/ai-conversations/` with the same split required by `plan.md`: `components/`, `hooks/`, `utils/`, and a small Zustand UI slice where needed. Do not add a new top-level `components/ai-conversations` tree.
- Keep shared UI state in Zustand. For AI Conversations this includes the active branch per conversation, scroll targets, and quick-switcher open state. `useState` is only for truly local ephemeral state.
- Use urql as transport only. Queries hydrate Zustand, active viewport subscriptions feed the same event processor, and mutation results do not become the canonical store write path.
- Build the branch view around a derived timeline abstraction, not a flat list of turns. Later tickets need inherited turns, fork separators, and summary nodes without rewriting the view layer.
- Later tickets that add conversation fields or metadata must also add the corresponding event emissions and Zustand handlers so multi-client state stays consistent.

## Foundation

| # | Ticket | What it does |
|---|--------|-------------|
| 01 | [Database Schema](01-database-schema.md) | Prisma models for AiConversation, Branch, Turn |
| 02 | [AI Conversation Service](02-ai-conversation-service.md) | Create, query, update conversations and branches |
| 03 | [Turn Service & LLM Integration](03-turn-service-and-llm.md) | Send turns, call LLM, store responses, streaming |
| 04 | [GraphQL Schema & Resolvers](04-graphql-schema-and-resolvers.md) | Types, queries, mutations, subscriptions |
| 05 | [Event Stream Integration](05-event-stream-integration.md) | Emit and subscribe to conversation events |
| 06 | [Zustand Store & Entity Integration](06-zustand-store.md) | Frontend entities, shared UI state, hydration, and viewport subscriptions |

## Core UI (Phase A)

| # | Ticket | What it does |
|---|--------|-------------|
| 07 | [Conversations Sidebar & List](07-conversations-sidebar-and-list.md) | Navigation entry, list view, filtering, search |
| 08 | [Conversation View & Turn Rendering](08-conversation-view-and-turns.md) | Turn list, input box, markdown rendering |
| 09 | [Conversation Creation & Model Selection](09-conversation-creation-and-model-selection.md) | New conversation flow, model picker, system prompt |

## Branching (Phase B)

| # | Ticket | What it does |
|---|--------|-------------|
| 10 | [Branch Forking Service & Context Assembly](10-branch-forking-and-context-assembly.md) | Create branches from turns, recursive context assembly algorithm |
| 11 | [Branch Forking UI](11-branch-forking-ui.md) | Fork button on turns, create branch flow, navigate to new branch |
| 12 | [Branch Tree Panel](12-branch-tree-panel.md) | Collapsible left panel showing full branch hierarchy |
| 13 | [Breadcrumb Navigation](13-breadcrumb-navigation.md) | Ancestry trail at top of conversation, clickable branch switching |
| 14 | [Branch Labels](14-branch-labels.md) | Name/rename branches, auto-label from first turn |

## Navigation Polish (Phase C)

| # | Ticket | What it does |
|---|--------|-------------|
| 15 | [Inline Branch Indicators](15-inline-branch-indicators.md) | Fork count badges on turns, popover to navigate to child branches |
| 16 | [Quick Switcher](16-quick-switcher.md) | Cmd+B overlay for keyboard-driven branch hopping |
| 17 | [Return to Fork Point](17-return-to-fork-point.md) | Navigation button to jump back to parent branch at fork turn |

## Sharing & Collaboration (Phase D)

| # | Ticket | What it does |
|---|--------|-------------|
| 18 | [Visibility & Sharing](18-visibility-and-sharing.md) | Private/org toggle, shared conversations list, read-only access |
| 19 | [Fork Others' Conversations](19-fork-others-conversations.md) | Deep copy a branch from a shared conversation into a private one |

## Context Management (Phase E)

| # | Ticket | What it does |
|---|--------|-------------|
| 20 | [Context Management & Rolling Summaries](20-context-management.md) | Token budgeting, auto-summarization, context health indicator |

## Agent Integration (Phase F)

| # | Ticket | What it does |
|---|--------|-------------|
| 21 | [Agent Conversation Observation](21-agent-conversation-observation.md) | Opt-in observability settings, event routing to agent pipeline |
| 22 | [Agent-Powered Conversation Features](22-agent-powered-features.md) | Auto-titling, branch label suggestions, ticket creation, suggested branches |

## Dependency graph

```
01 Database Schema
└─ 02 Conversation Service
   └─ 03 Turn Service & LLM
      ├─ 04 GraphQL Schema & Resolvers
      │  └─ 05 Event Stream Integration
      │     └─ 06 Zustand Store & Viewport Subscriptions
      │        ├─ 07 Conversations Sidebar & List
      │        ├─ 08 Conversation View & Turns ─────────┐
      │        │  └─ 09 Creation & Model Selection       │
      │        └─ 21 Agent Observation ──────────────────┤
      │           └─ 22 Agent-Powered Features          │
      │                                                 │
      └─ 10 Branch Forking & Context Assembly ──────────┤
         ├─ 11 Branch Forking UI                        │
         ├─ 12 Branch Tree Panel                        │
         ├─ 13 Breadcrumb Navigation                    │
         └─ 14 Branch Labels                            │
                                                        │
15 Inline Branch Indicators (needs 11,12,14) ──────────┤
16 Quick Switcher (needs 12) ──────────────────────────┤
17 Return to Fork Point (needs 11,13) ─────────────────┤
                                                        │
18 Visibility & Sharing (needs 07,08,11) ──────────────┤
└─ 19 Fork Others' Conversations (needs 10,18)         │
                                                        │
20 Context Management (needs 03,06,08,10) ────────────┘
```
