# Ticket 9: Platform Boundaries & Monorepo Hygiene

## Goal

Create the foundation for a real multi-app product instead of three apps and one shared package drifting independently. This ticket standardizes repository tooling, creates shared contracts/config packages, removes obvious duplication, and establishes architectural boundaries the rest of the rewrite can rely on.

## Context

The repo is already a `pnpm` workspace, but the platform surface is still fragmented:

- Root docs and scripts are stale relative to the monorepo layout.
- Both `pnpm-lock.yaml` and `package-lock.json` exist.
- Server URL resolution is duplicated in `apps/desktop/src/main/ipc/shared.ts` and `apps/desktop/src/main/agents/spawnAgent.ts`.
- Session-rendering utilities are duplicated between `apps/desktop/src/utils.ts` and `packages/shared-ui/src/utils.ts`.
- Relay action names, workspace statuses, and event names are still mostly stringly-typed across apps.

If we skip this step, Tickets 10-13 will land in three different shapes and create more drift while trying to fix drift.

## Tasks

### 1. Standardize the monorepo toolchain

- Adopt `pnpm` as the only package manager.
- Delete `package-lock.json`.
- Add root scripts for:
  - `build`
  - `test`
  - `typecheck`
  - `lint`
  - `codegen`
- Make those scripts run through the workspace (`pnpm -r` or filtered commands), not per-app copy-paste.

### 2. Create shared contracts and config packages

Add:

- `packages/contracts/`
- `packages/config/`

**`packages/contracts`** should own:

- relay action names
- typed relay params/results
- workspace status constants/helpers
- domain event names
- any payload shapes shared between web, desktop, and server

**`packages/config`** should own:

- environment parsing with `zod`
- shared server URL resolution
- per-runtime config loaders (`server`, `desktop`, `web`)
- dev/prod defaults in one place

### 3. Remove duplicated runtime-resolution logic

Replace ad hoc `resolveServerUrl()` implementations with a shared helper from `packages/config`.

At minimum, remove the duplicate logic in:

- `apps/desktop/src/main/ipc/shared.ts`
- `apps/desktop/src/main/agents/spawnAgent.ts`

The same rule should apply to any future host/URL/env resolution.

### 4. Move string constants out of app-local files

Anything used across process boundaries must leave app-local code and move into `packages/contracts`, especially:

- relay action names
- workspace/ticket status names
- pubsub/topic event names where the client and server both care
- runner connection-status strings

The rule is simple: if two apps need to agree on a literal, that literal does not belong in either app.

### 5. Establish import boundaries

- Add a shared `tsconfig` base for all apps/packages.
- Add lint/import rules so app code cannot reach into another app's internal files.
- Shared packages must not import from `apps/*`.
- Document allowed directions:
  - apps may import packages
  - packages may import packages
  - apps may not import other apps

### 6. Record the architecture

Add a short ADR or architecture note that defines:

- the bounded contexts (`web`, `desktop`, `server`, `shared packages`)
- what crosses boundaries
- what must remain local to each runtime
- how new shared code gets placed

## Verification

1. `pnpm -r build` succeeds.
2. `pnpm -r test` succeeds.
3. `pnpm -r typecheck` succeeds.
4. `package-lock.json` is gone.
5. `rg "function resolveServerUrl|export function resolveServerUrl" apps packages` returns one shared implementation.
6. Relay/status/topic literals consumed by multiple runtimes are imported from `packages/contracts`.
7. No shared package imports from `apps/`.

## Files Changed

- **Modified**: root `package.json`, root `README.md`, workspace configs, app/package `package.json` files, tsconfig files
- **Created**: `packages/contracts/*`, `packages/config/*`, architecture note / ADR
- **Deleted**: `package-lock.json`
- **Refactored**: duplicated runtime-resolution helpers and duplicated cross-runtime constants

## Dependencies

- This ticket should happen before Tickets 11 and 12.
- Ticket 10 can start in parallel once the shared contract/config direction is settled.
