# Ticket 12: Shared Surface & Client Convergence

## Goal

Eliminate duplicated logic between the desktop app, the web app, and `packages/shared-ui`. Shared behavior should live in shared packages; client-specific behavior should live in client shells. After this ticket, "same domain concept, different implementation in three places" should no longer be normal.

## Context

There is already clear duplication across the clients:

- `apps/desktop/src/utils.ts` and `packages/shared-ui/src/utils.ts` overlap heavily.
- `apps/web/src/utils.ts` is just a re-export layer over shared code.
- The desktop and web apps each maintain their own types, fragments, and store/hook patterns around the same workspace/thread/session domain.
- Shared UI code exists, but the split between "shared domain/rendering logic" and "app shell logic" is still muddy.

Without convergence, every future bug fix will continue to cost 2x or 3x.

## Tasks

### 1. Define the shared domain surface

Create or extend shared packages so these concepts have one home:

- workspace/ticket status helpers
- session render-node building
- event/tool-name normalization
- thread rendering primitives
- relay/domain payload types
- shared GraphQL fragments/documents where feasible

Pure logic leaves the app. App-specific orchestration stays in the app.

### 2. Remove desktop/shared-ui duplication

Move the duplicated pure utilities and types out of `apps/desktop/src/` into shared packages, then delete the desktop-local copies.

Focus first on the session/thread rendering path because it is the clearest overlap and the easiest place for behavior drift to become user-visible.

### 3. Unify GraphQL contracts

Stop defining the same domain fragment or field selection in multiple places. Introduce a shared contract layer for:

- common fragments
- common query field groups
- shared generated types where practical

The goal is not to over-centralize every operation. It is to centralize the repeated domain selections that both clients depend on.

### 4. Converge client-side domain helpers

Where desktop and web both need the same domain rule, move it into shared code. Examples:

- status derivation
- run-state helpers
- workspace grouping logic
- thread/session normalization
- event parsing/render heuristics

### 5. Tighten the shared-ui package contract

`packages/shared-ui` should contain reusable presentation logic and pure helpers, but it should not depend on app-local stores, hooks, or runtime-only behavior.

Enforce:

- no imports from `apps/*`
- clear package exports
- tests for critical render-node and parsing behavior

### 6. Converge design/system primitives deliberately

Do not blindly force desktop and web to look identical, but do share:

- status/token/color tokens where they represent the same domain meaning
- shared event/thread primitives
- markdown/diff rendering behavior
- component contracts for common thread elements

### 7. Back the shared layer with tests

Add unit tests around:

- render-node building
- prompt extraction / tool normalization
- status helpers
- any other pure logic moved into shared packages

## Verification

1. `pnpm --filter @trace/shared-ui build` succeeds.
2. Both `trace-web` and `trace` still build and render threads correctly.
3. `rg "buildSessionNodes|stripTraceInternal|normalizeToolName|extractPromptText" apps/desktop/src apps/web/src packages/shared-ui/src` shows one shared implementation for duplicated pure logic.
4. Shared packages have tests for their pure logic.
5. No shared package imports from `apps/*`.

## Files Changed

- **Modified**: `packages/shared-ui/src/*`, `apps/desktop/src/utils.ts`, `apps/desktop/src/types.ts`, `apps/web/src/utils.ts`, GraphQL fragment/type files, client hooks/components that consume moved logic
- **Created**: shared tests and any additional shared package modules required by the new split
- **Deleted**: app-local duplicate pure helpers after migration

## Dependencies

- Depends on Tickets 1-4 and 9.
- Best done after Ticket 11 so shared convergence lands on top of hardened desktop contracts.
