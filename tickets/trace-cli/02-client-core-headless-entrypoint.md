# 02 - client-core Headless Entrypoint

## Summary

Add a React-free subpath export (`@trace/client-core/headless`) so Node clients can use the platform, stores, GraphQL client, and event normalization without `react` installed. Web and mobile are untouched.

## Plan coverage

Owns plan lines:

- 55: framework-agnostic client-core baseline
- 86: no new package — client-core gains an entrypoint
- 90-92: headless entrypoint definition

## What needs to happen

- Create `packages/client-core/src/headless.ts` re-exporting only the framework-agnostic surface:
  - platform: `setPlatform`, `getPlatform`, `Platform` type
  - GraphQL: `createGqlClient`, `GqlClient`
  - stores: `useEntityStore`, `useAuthStore` (Zustand vanilla access via `getState`/`subscribe`)
  - event handling: `handleOrgEvent`, `handleSessionEvent`, `routeSessionOutput`, `sessionPatchFromOutput`
  - session nodes: `buildSessionNodes` and node types
  - scope helpers: `eventScopeKey`, `messageScopeKey`
  - optimistic helpers: `optimisticallyInsertSessionMessage`, `reconcileOptimisticSessionMessage`
- Audit that module graph for `react` imports; if any shared module imports React, split the hook out of it. Hooks stay in the root entrypoint.
- Add the `"./headless"` entry to `packages/client-core/package.json` `exports` (JS + types). The `"."` export keeps its exact current behavior.
- Add a guard test that imports the headless entry in an environment without `react` and fails on any transitive `react` resolution.

## Dependencies

- None. Can run in parallel with 01.

## Completion requirements

- [ ] `@trace/client-core/headless` resolves with types from a Node ESM consumer
- [ ] The headless module graph contains no `react` import (guard test enforces this)
- [ ] The root entrypoint is unchanged; `apps/web` builds and type-checks with no changes
- [ ] `apps/mobile` requires no changes

## Implementation notes

- This is a re-export file plus an exports-map entry, not a refactor. Only move code if the react-free guard test forces it.
- Keep the export list explicit (no `export *` from the root index) so the react-free boundary is auditable.

## How to test

1. Guard test: in a temp dir without `react`, `node -e "import('@trace/client-core/headless')"` succeeds.
2. `pnpm -r build` passes; `apps/web` typecheck passes untouched.
3. Ticket 04's runtime imports everything it needs from the headless entry alone.
