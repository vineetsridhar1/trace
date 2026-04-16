# Trace v2

Unified AI-native platform that collapses project management, team communication, and AI-assisted development into a single product built on a shared event log.

## Core Thesis

The distinction between chat, project management, and AI coding is artificial. These are all events in a shared space. Unify the event model, give agents first-class citizenship, and the workflow becomes fundamentally simpler.

## Design Principles

### Everything Is an Event

Every meaningful action produces an immutable, append-only event. Events are the atomic unit of the platform. The UI, API, agent system, and real-time sync all operate on the same event stream. No client or agent ever creates events directly — events are always produced by the service layer.

### Agents Are First-Class Citizens

No separate "agent mode." Agents operate through the exact same service layer as human users. The permissions model, event schema, and service layer treat human and agent actors identically. The only distinction is the `actor_type` field on each event. Any capability built for users is automatically available to agents.

### Service Layer Is the Product

GraphQL is just the external interface. The agent runtime calls the service layer directly — it does not go through GraphQL. GraphQL resolvers must be thin wrappers: parse input, call a service, format output. Every new service method is automatically available to both clients and agents.

```
Web / Mobile / Electron  →  GraphQL  →  Service Layer  ←  Agent Runtime
                                             ↓
                                        Event Store
```

### Actions In, Events Out

Clients call mutations to perform actions. The service layer validates, authorizes, executes, and produces events as side effects. Events flow back through subscriptions. The service layer is the single source of truth for business logic, validation, and authorization.

### Flat Entity Model

All entities (channels, sessions, tickets, repos, projects) are peers scoped to an organization. Relationships are links, not containment. Nothing nests inside anything else. This keeps the model extensible.

### Pluggable Adapters, Not Hardcoded Integrations

Three interfaces define Trace's pluggable boundaries:

- **SessionAdapter** — where the session runs (cloud via Fly, local via Electron)
- **CodingToolAdapter** — what coding tool runs (Claude Code, Cursor, etc.)
- **LLMAdapter** — what model powers AI features (Anthropic, OpenAI, etc.)

No core system has a hard dependency on a specific vendor. Adding a new hosting mode, coding tool, or LLM provider means implementing one interface.

## Architecture Rules

### GraphQL

- **Schema source of truth**: `packages/gql/src/schema.graphql` — single file, no duplication
- **Codegen**: `pnpm gql:codegen` generates shared types and server resolver types from the schema
- **Server reads schema at startup** via `@trace/gql/schema.graphql` package export
- **Resolvers are thin** — they call the service layer, they do not contain business logic
- **Subscriptions** power the real-time event stream for external clients; the agent subscribes directly via the broker

### Frontend (React + urql + Zustand)

- **Zustand is the single state management solution**. No React context for state. No urql normalized cache. No `useState` for shared state. One system, one mental model.
- **urql is a transport layer only**. It sends queries and manages the WebSocket. Its cache is disabled. All results are normalized into Zustand. urql never triggers re-renders — Zustand does.
- **Components take entity IDs as props**, not full objects. Use `useEntityField(type, id, field)` selectors for fine-grained re-renders. For events, use `useScopedEventField(scopeKey, id, field)` — events are partitioned by scope, not stored in a flat table.
- **Virtualize all lists** — message lists, event logs, ticket lists. Only visible items render to the DOM.
- **Optimistic updates** — write to cache before server round-trip, reconcile when the event comes back.
- **Viewport-driven subscriptions** — subscribe on navigate-in, unsubscribe on navigate-away. Only the ambient tier (badges, mentions, notifications) stays always-on.

### UI & Component Guidelines

- **Use shadcn/ui components** as the primary component library. Add new shadcn components via `npx shadcn@latest add <component>` from `apps/web/`. Do not hand-roll components that shadcn already provides.
- **Use Tailwind CSS idiomatically.** Prefer utility classes over custom CSS. Use the project's semantic tokens (`bg-surface-deep`, `text-muted-foreground`, etc.) over raw color values. Compose with `cn()` from `@/lib/utils`.
- **One component per file.** Each React component gets its own file. Small helper components used only within a single file (e.g., a list item renderer) are the sole exception.
- **Keep components small and focused.** If a component exceeds ~150 lines, split it. Extract sub-components, hooks, or utilities into their own files.
- **File structure mirrors the UI tree.** Place components in directories that reflect where they appear: `components/sidebar/`, `components/channel/`, `components/session/`, etc. Shared primitives go in `components/ui/`.
- **Minimize re-renders.** Use fine-grained Zustand selectors (`useEntityField`), not broad store subscriptions. Avoid inline object/array literals in props. Extract stable callbacks with `useCallback` only when passed to memoized children.
- **Animations use framer-motion.** Keep animations subtle and purposeful — spring transitions for interactive elements, layout animations for list reordering. No animation for the sake of animation.

### Server

- **Service layer owns all business logic**. Both GraphQL resolvers and the agent runtime call the same services.
- **Event generation is a service-layer concern**. Every service method that mutates state must append an event to the event store and broadcast it.
- **Session Router** is the single place that knows about hosting modes. It dispatches to FlyAdapter (cloud) or bridge WebSocket (local).

### Electron Desktop

- Thin shell that loads the web app and runs the bridge WebSocket for local sessions.
- **Preload** exposes `window.trace` for IPC. **Bridge** connects to `ws://server/bridge` for session control.
- The Electron app is both a frontend and a bridge simultaneously — logically separate concerns.

## Monorepo Structure

```
packages/gql/        — GraphQL schema, codegen, generated types (no runtime code)
packages/shared/     — Non-schema shared constants (keep this minimal)
apps/server/         — Apollo + Express, service layer, Prisma, WebSocket endpoints
apps/web/            — React + Vite + urql + Zustand, TailwindCSS
apps/desktop/        — Electron shell + bridge client
```

## Code Quality

### Approach

- **Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and ask. Push back when a simpler approach exists.
- **Minimum code that solves the problem.** No features beyond what was asked. No abstractions for single-use code. No speculative "flexibility." If 200 lines could be 50, rewrite it.
- **Surgical changes only.** Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style. Every changed line should trace directly to the request. Remove only orphans YOUR changes created — leave pre-existing dead code alone (mention it, don't delete it).
- **Define success criteria, then loop.** Transform tasks into verifiable goals ("add validation" → "write tests for invalid inputs, make them pass"). For multi-step tasks, state a brief plan with verification checks at each step.

### Rules

- **No duplicated type definitions.** Enums and types that exist in `schema.graphql` come from `@trace/gql` codegen. Do not redefine them elsewhere.
- **No business logic in resolvers.** Resolvers call services. Period.
- **No direct event creation by clients or agents.** Events come from the service layer only.
- **No vendor-specific imports outside adapter implementations.** The platform talks to adapters, not providers.
- **No deep object passing to components.** Pass IDs, select fields via Zustand hooks.
- **No `useState` for state that could be shared.** If two components might need it, use Zustand.
- **No urql cache for state management.** urql is transport only. Data lives in Zustand.
- **No `any` types.** Never use `any` — use `unknown` with runtime narrowing for truly unknown data, or import the correct type from `@trace/gql` or `@prisma/client`. GQL scalar overrides in codegen ensure `DateTime` → `string` and `JSON` → `Record<string, unknown>`.
- **Events are the source of truth for state changes.** Never read mutation results to update the Zustand store. Mutations fire-and-forget; the org-wide event subscription (`useOrgEvents`) receives the resulting event and updates the store. This ensures all clients see changes, not just the one that triggered the mutation. Event payloads must carry enough data to upsert the full entity directly — no refetches. Lists derive from the entity store (e.g. filter `sessions` by `channel.id`), so new entities appear automatically when upserted by event handlers.
- **Events are partitioned by scope in Zustand.** The entity store uses `eventsByScope: Record<string, Record<string, Event>>` keyed by `${scopeType}:${scopeId}`. Use `eventScopeKey()`, `useScopedEvents()`, `useScopedEventIds()`, and `useScopedEventField()` from `stores/entity.ts` — never store events in the generic entity tables. Components that need the scope key should read it from `EventScopeContext` via `useEventScopeKey()`.

## Commands

```bash
pnpm dev              # Run all apps in parallel
pnpm dev:server       # Apollo server on :4000
pnpm dev:web          # Vite on :3000 (proxies to :4000)
pnpm dev:desktop      # Electron (loads :3000)
pnpm gql:codegen      # Regenerate types from schema.graphql
pnpm db:migrate       # Run Prisma migrations
pnpm db:generate      # Generate Prisma client
pnpm build            # Build all packages
```
