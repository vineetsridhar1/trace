# Production-Readiness Migration Program

**[Read the vision first →](./00-vision.md)**

## Scope Reality

Tickets **1-8 are not fully comprehensive for the full codebase**. They are the web-first client modernization plan plus a targeted server-side status fix. That work is necessary, but it does **not** make Trace production-ready by itself because the repo currently spans roughly:

- `apps/web/src/`: 60 files
- `apps/desktop/src/`: 226 files
- `apps/server/src/`: 196 files
- `packages/shared-ui/src/`: 28 files

If the goal is "rewrite this software so the architecture is clean, reliable, and production ready," the plan needs to cover the full stack. Tickets **9-13** below extend the migration into platform boundaries, server/runtime hardening, Electron hardening, shared package convergence, and delivery/operability.

## Ticket Catalog

### Phase 1: Web-First Stabilization

| # | Ticket | Depends On | Scope |
|---|--------|------------|-------|
| 1 | [Foundation & Tooling](./01-foundation-and-tooling.md) | — | Web aliases, feature dirs, `lib/storage.ts`, `lib/events.ts`, delete dead web code |
| 2 | [Kill Registered Actions](./02-kill-registered-actions.md) | 1 | Remove `syncActions` / `workspaceActions` pattern from the web app |
| 3 | [Runner Abstraction](./03-runner-abstraction.md) | 1 | `RunnerAdapter`, `ServerRelayAdapter`, decouple relay hooks from `InstanceContext` |
| 4 | [Component Decomposition](./04-component-decomposition.md) | 1 | Break up the largest web components, dedupe fragments/constants |
| 5 | [Performance Foundations](./05-performance-foundations.md) | — | Lazy routes, error boundaries, virtualization prep |
| 6 | [Instant Workspace Switching](./06-instant-workspace-switching.md) | — | Per-workspace thread cache, stale-while-revalidate, buffered subscriptions |
| 7 | [Comprehensive Cleanup & Quality](./07-comprehensive-cleanup.md) | 1-6 | Web consistency pass, stricter TS, dead-code removal, Apollo cache docs |
| 8 | [Reliable Status System](./08-reliable-status-system.md) | — | Server-authoritative workspace status and reconnect resilience |

### Phase 2: Codebase-Wide Architecture Hardening

| # | Ticket | Depends On | Scope |
|---|--------|------------|-------|
| 9 | [Platform Boundaries & Monorepo Hygiene](./09-platform-boundaries-and-monorepo-hygiene.md) | — | Shared contracts/config, package-manager cleanup, root scripts, dependency boundaries |
| 10 | [Server Runtime, Data & Eventing Hardening](./10-server-runtime-data-and-eventing-hardening.md) | 9 recommended | Secure config, distributed pubsub/outbox, service decomposition, transactional invariants |
| 11 | [Desktop Runtime & Electron Hardening](./11-desktop-runtime-and-electron-hardening.md) | 9 | Typed IPC/relay contracts, BrowserWindow security, process/worktree recovery |
| 12 | [Shared Surface & Client Convergence](./12-shared-surface-and-client-convergence.md) | 1-4, 9 | Remove duplicated desktop/web/shared-ui logic and converge shared UI/domain code |
| 13 | [Quality Gates, Observability & Delivery](./13-quality-gates-observability-and-delivery.md) | 1-12 | CI, e2e, release process, telemetry, runbooks, migration rollout, SLOs |

## Priority

There are two different notions of "high priority" here:

- **Highest user-facing impact**: Tickets **6** and **8**
- **Highest systemic risk reduction**: Tickets **10** and **11**
- **Foundational for the full rewrite**: Ticket **9**
- **Final release gate**: Ticket **13**

If you only execute Tickets 1-8, you will get a much better web app, but you will still have:

- an Electron main process with large stringly-typed IPC/relay surfaces
- a server that is still not production-grade in security, eventing, and operability
- duplicated shared logic across desktop and `packages/shared-ui`
- no complete CI / release / observability program

## Recommended Order

Recommended full-program order:

`9 → 10 → 11 → 8 → 6 → 1 → 2 → 3 → 4 → 5 → 7 → 12 → 13`

Why:

- `9` gives you shared contracts, config, and repo hygiene so later work does not create more duplication.
- `10` addresses the biggest back-end production risks early.
- `11` moves Electron hardening forward because Electron is a permanent runtime, not a temporary bridge.
- `8` and `6` fix the most trust-destroying user-facing issues immediately.
- `1-7` clean up the web client on top of the new foundation.
- `12` converges the shared surface after the desktop/runtime boundaries are hardened.
- `13` closes the loop with quality gates, rollout safety, and operational readiness.

## Parallelism

- `8` can proceed in parallel with `9`
- `10` can start once the contract/config direction from `9` is set
- `11` can start once `9` is merged; it should not wait until the web track is done
- `1-7` can continue as the web-first track in parallel with early `10`
- `12` should not begin until `9` and the core parts of `11` are merged, otherwise it will just reintroduce duplication
- `13` should start early for CI scaffolding, but its final gate only closes after `1-12`

## Coverage

### What Tickets 1-8 cover well

- The entire `apps/web/src/` surface
- The current server-side status lifecycle and reconnect correctness path
- Web performance, state management, component decomposition, and relay abstraction

### What Tickets 1-8 do not cover

- Root monorepo hygiene and shared contracts
- Server security, config validation, scalable eventing, and transactional boundaries
- Electron runtime hardening, typed IPC validation, and restart/orphan recovery
- Shared package convergence between desktop, web, and `packages/shared-ui`
- CI/CD, deployment, observability, incident response, migration rollout, and backups

## After all tickets

The codebase will have:

- Reliable, server-authoritative status tracking with reconnect safety
- Fast web workspace switching and a clean browser architecture
- Explicit platform boundaries between web, desktop, server, and shared packages
- A typed cross-process contract for relay actions and runtime configuration
- A production-grade server eventing model that can scale beyond one process
- A hardened Electron runtime with validated IPC and recoverable process lifecycle
- A real shared surface for session rendering, status helpers, and GraphQL contracts
- CI, smoke/e2e coverage, release runbooks, observability, and rollback safety
