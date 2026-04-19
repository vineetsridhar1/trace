# 02 — Extract Entity Store to `client-core`

## Summary

Move the Zustand entity store (`apps/web/src/stores/entity.ts` and its associated selectors/hooks) into `@trace/client-core`. The store is already platform-free — it only manipulates plain data — but it must be audited for any browser-specific imports before the move. Web continues to consume the store via `@trace/client-core` imports after this lands.

## What needs to happen

- Audit `apps/web/src/stores/entity.ts` for any imports of `window`, `document`, `localStorage`, `react-dom`, or any web-only package. Expected: none, but verify.
- Move the file to `packages/client-core/src/stores/entity.ts`. Preserve all exports: `useEntityStore`, `useEntityField`, `useScopedEvents`, `useScopedEventIds`, `useScopedEventField`, `eventScopeKey()`, all upsert/remove helpers, reverse-index helpers, type exports (`SessionEntity`, `SessionGroupEntity`, etc.).
- Export everything from `packages/client-core/src/index.ts`.
- Update all imports in `apps/web/src/` that referenced `@/stores/entity` to import from `@trace/client-core` instead.
- Preserve `EventScopeContext` and `useEventScopeKey` where they live — these are React context, not Zustand state. They can stay in `apps/web` for now (mobile will re-implement as needed).
- Verify no behavior changes in web.

## Dependencies

- [01 — `packages/client-core` Scaffolding](01-client-core-scaffolding.md)

## Completion requirements

- [x] `packages/client-core/src/stores/entity.ts` is the only copy of the entity store
- [x] `apps/web/src/stores/entity.ts` is deleted
- [x] Every consumer in `apps/web` imports from `@trace/client-core`
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes (including the client-core no-web-imports rule)
- [ ] Manual smoke: run web dev, log in, open a session, send a message — behavior unchanged

## How to test

1. `pnpm typecheck` passes across the monorepo.
2. Run `pnpm dev:web` and `pnpm dev:server`. Log in, navigate between channels, open a session, send a message, verify events appear live, verify optimistic messages reconcile.
3. `grep -r "from.*@/stores/entity" apps/web/src` returns nothing.
