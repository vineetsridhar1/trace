# Web-First Migration Tickets

**[Read the vision first →](./00-vision.md)**

Run these sequentially. Each ticket produces a working app.

## Execution Order

| # | Ticket | Depends On | Scope |
|---|--------|------------|-------|
| 1 | [Foundation & Tooling](./01-foundation-and-tooling.md) | — | Path aliases, feature dirs, `lib/storage.ts`, `lib/events.ts`, delete dead `appUIStore.ts`, migrate all `localStorage` calls, delete dead `utils.ts` |
| 2 | [Kill Registered Actions](./02-kill-registered-actions.md) | 1 | Remove `syncActions`/`workspaceActions` pattern, use event bus, fix `clearSession` in WebThreadPanel |
| 3 | [Runner Abstraction](./03-runner-abstraction.md) | 1 | `RunnerAdapter` interface, `ServerRelayAdapter`, rewire all 6 relay hooks |
| 4 | [Component Decomposition](./04-component-decomposition.md) | 1 | Break 3 large components into ~12 small files, extract shared constants, deduplicate `WORKSPACE_FIELDS` fragment and `MODE_CONFIG` |
| 5 | [Performance Foundations](./05-performance-foundations.md) | — | Lazy routes, error boundaries, prep for virtualization |
| 6 | [Instant Workspace Switching](./06-instant-workspace-switching.md) | — | Per-workspace session cache, stale-while-revalidate, subscription buffering |
| 7 | [Comprehensive Cleanup & Quality](./07-comprehensive-cleanup.md) | 1-6 | Audit all ~31 untouched files, TypeScript strictness, document Apollo cache, remove dead types, final consistency pass |
| 8 | [Reliable Status System](./08-reliable-status-system.md) | — | Server-authoritative status, broadcast every transition, remove client-side optimistic status, reconnect resilience |

## Priority

**Tickets 6 and 8 are the highest-impact changes for perceived quality.**
- Ticket 6 fixes workspace switching lag (500ms-1s → instant)
- Ticket 8 fixes status desync (agent running but UI says "completed", etc.)

Both are independent of Tickets 1-5 and can be done first.

## Parallelism

Tickets 2, 3, and 4 are independent of each other — they all depend only on Ticket 1. They can be run in parallel after Ticket 1 merges, as long as they touch different files. In practice:

- **Tickets 2 + 3 can run in parallel** (2 touches stores/hooks, 3 touches relay hooks and App.tsx)
- **Ticket 4 is safest to run alone** since it restructures the same component files that other tickets may reference
- **Ticket 5 can run any time** since it only adds new code (ErrorBoundary) and wraps existing components
- **Ticket 6 can run any time** since it modifies threadStore and useThreadSync which other tickets don't deeply restructure
- **Ticket 7 must run after 1-6** — it's a final sweep that depends on all patterns from Tickets 1-6 being in place
- **Ticket 8 can run any time** — it touches server code + agentRunStore/subscriptions, independent of the UI restructuring tickets

Recommended order for maximum impact: `8 → 6 → 1 → 2 → 3 → 4 → 5 → 7`
Safest order: `1 → 2 → 3 → 4 → 5 → 6 → 8 → 7`

## Coverage

These 8 tickets collectively touch **every file** in `apps/web/src/` and the critical server status paths:

| Category | Files | Covered By |
|----------|-------|------------|
| Stores (5 files) | `threadStore`, `agentRunStore`, `appUIStore`, `instanceStore`, `workspaceStore` | Tickets 1, 2, 6, 7, 8 |
| Relay hooks (8 files) | All `use*Relay.ts` + `types.ts` + `useRelayAction.ts` | Ticket 3 |
| Core hooks (6 files) | `useThreadSync`, `useChannelSubscriptions`, `useWorkspaceActions`, `useWorkspaceSync`, `useWorktreeChanges`, `usePRStatus` | Tickets 2, 6, 7, 8 |
| Input hooks (3 files) | `useFileMention`, `useSlashCommands`, `useImageAttachments` | Ticket 7 |
| Large components (3 files) | `WebWorkspaceList`, `WebThreadPanel`, `WebThreadInput` | Ticket 4 |
| Small components (8 files) | `WebRunButtons`, `WebModelEffortSelector`, `ConnectionStatusBar`, etc. | Ticket 7 |
| Pages (4 files) | `LoginPage`, `AuthCallbackPage`, `InstancePickerPage`, `WorkspacePage` | Tickets 5, 7 |
| Contexts (2 files) | `AuthContext`, `ChannelContext` | Ticket 7 |
| GraphQL (2 files) | `client.ts`, `fragments.ts` | Tickets 4, 7 |
| Config & entry (4 files) | `App.tsx`, `main.tsx`, `types.ts`, `vite.config.ts` | Tickets 1, 3, 5, 7 |
| Server status (4 files) | `eventService.ts`, `workspaceService.ts`, `ticketService.ts`, `updateWorkspaceStatus.ts` | Ticket 8 |
| Server schema (1 file) | `schema.prisma` | Ticket 8 |

## After all tickets

The web app will have:
- **Reliable status tracking** — server-authoritative, every transition broadcasts, no client-side guessing
- **Instant workspace switching** with per-workspace session cache and subscription buffering
- Feature-based directory skeleton with path aliases
- **Centralized localStorage** via `lib/storage.ts` (no scattered `localStorage` calls)
- Clean, focused Zustand stores (no god store, no registered actions)
- Runner abstraction layer ready for cloud execution
- Small (<200 line) component files with no duplication
- Route-level code splitting and error boundaries
- `@tanstack/react-virtual` installed and ready for thread virtualization
- **Documented Apollo cache policies** with rationale
- **Stricter TypeScript** (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
- **Zero dead code** — no unused types, re-export barrels, or orphaned patterns
- **Single source of truth** for GraphQL fragments and shared constants
- **Reconnect resilience** — subscription reconnect triggers full workspace refresh
