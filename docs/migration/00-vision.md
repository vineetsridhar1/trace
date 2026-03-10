# Ticket 0: The Goal

## What we're doing

We're turning Trace's web app from a bolted-on sidecar of the Electron app into a first-class product. Today the web app is a copy-paste of desktop patterns that don't belong in a browser — god stores, registered callback anti-patterns, dead code from the desktop, client-side status guessing, and zero caching. It's slow, flaky, and hard to build on.

After this migration, the web app is a standalone, fast, reliable SPA that treats execution as a pluggable capability rather than assuming Electron is always there.

## Why

The Electron-first architecture is a ceiling. Every new feature fights the foundation:

- **It's laggy.** Switching workspaces takes 500ms-1s because the app wipes all session data, waits 150ms, then makes two sequential network requests with no caching. Users with 10+ active workspaces feel this on every click.

- **Statuses lie.** The UI says "completed" while the agent is still running, or "running" after the agent stopped. There are 10 identified race conditions in the status system — dual update paths, silent DB writes that never broadcast, client-side optimistic state that drifts from reality, and reconciliation timers with arbitrary thresholds.

- **The code is tangled.** Stores hold callback functions registered by hooks at mount time. Components are 400-500 lines with inline sub-components, duplicated fragments, and duplicated constants. There's a 173-line "god store" that's never imported. There's a 10-line utils.ts that only re-exports. `localStorage` is scattered across 6 files with raw string keys.

- **It can't grow.** Adding cloud execution means plugging in a new transport — but today every relay hook is hardwired to a specific GraphQL mutation path through `useInstance()`. Adding a new page means loading the entire app upfront because there's no code splitting. Adding a new status means updating client-side Sets, server-side arrays, a transition matrix, reconciliation hooks, and optimistic update logic in three different files.

## What "done" looks like

### For users
- Click a workspace, it opens instantly. The session data is already in memory from subscription buffering. Background revalidation updates it silently.
- Status indicators are always correct. If the agent is running, the spinner spins. If it stopped, the spinner stops. No exceptions, no lag, no flicker.
- The web app loads fast. Routes are lazy-loaded. The login page doesn't bundle the workspace renderer.
- Reconnecting after a network drop doesn't leave stale data — the app refreshes everything on reconnect.

### For developers
- Every file is under 200 lines. Components do one thing. Hooks are focused. Stores are lean.
- There's one way to access localStorage (`lib/storage.ts`), one way to execute actions (`useRunner()`), one way to communicate between decoupled hooks (`lib/events.ts`), one definition of each GraphQL fragment, one definition of each shared constant.
- Adding a new execution backend (cloud runner, direct local connection) means implementing one interface (`RunnerAdapter`) and wiring it into `RunnerContext`. No relay hooks change.
- Status transitions are server-authoritative. The client reflects what the server tells it. Period. No client-side guessing, no optimistic status sets, no dual update paths.
- TypeScript catches unused variables, missing returns, and fallthrough cases at compile time.
- The feature directory skeleton (`features/auth`, `features/runner`, `features/workspace`, etc.) is ready for incremental migration as the app grows.

## The 8 tickets

| # | What it does | Why it matters |
|---|-------------|----------------|
| **8** | Make status server-authoritative, broadcast every transition, remove client-side guessing | **Fixes status lies.** The #1 trust-destroying bug. |
| **6** | Per-workspace session cache, stale-while-revalidate, subscription buffering | **Fixes lag.** The #1 perceived-performance problem. |
| **1** | Path aliases, `lib/storage.ts`, `lib/events.ts`, delete dead code, migrate localStorage | **Lays the foundation.** Every subsequent ticket depends on clean infrastructure. |
| **2** | Kill syncActions/workspaceActions registered callback pattern | **Removes the worst anti-pattern.** Hooks should not register callbacks into stores. |
| **3** | RunnerAdapter interface, ServerRelayAdapter, rewire relay hooks | **Unlocks cloud execution.** Decouples "what to do" from "how to reach the executor". |
| **4** | Break 3 giant components into ~12 focused files, deduplicate fragments/constants | **Makes the code navigable.** No more 500-line files with 4 inline components. |
| **5** | Lazy routes, error boundaries, prep for virtualization | **Web-app table stakes.** Code splitting, graceful errors, ready for long-list performance. |
| **7** | Audit every remaining file, TypeScript strictness, document Apollo cache, final sweep | **No loose ends.** Every file in the app follows the new patterns. |

## Execution

Recommended order for maximum user impact: `8 → 6 → 1 → 2 → 3 → 4 → 5 → 7`

Each ticket is self-contained and leaves the app in a working state. Run them sequentially. After all 8, the web app is a product you can hand to users and be proud of — not something you have to apologize for being "still kind of a desktop app in a browser."
