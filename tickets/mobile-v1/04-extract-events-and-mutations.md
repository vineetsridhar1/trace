# 04 — Extract Event Handlers, Mutations, and GQL Client Factory

## Summary

Move the event-handling pipeline (the pure store-update logic inside `useOrgEvents` and `useSessionEvents`), the mutations/optimistic-message helpers, and the urql client factory into `@trace/client-core`. The React hook shells stay in `apps/web` and just wire subscriptions into the shared handler functions — mobile will do the same.

## What needs to happen

- **Event handlers:**
  - Create `packages/client-core/src/events/handlers.ts`. Move all logic from `apps/web/src/hooks/useOrgEvents.ts` that takes an `Event` and patches the entity store — it should be pure functions:
    ```ts
    export function handleOrgEvent(event: Event): void; // calls useEntityStore.getState().set(...)
    export function handleSessionEvent(event: Event): void;
    ```
  - Move the `session_output` subtype routing into `packages/client-core/src/events/session-output.ts`.
  - Preserve parity with the web event pipeline for every V1-relevant event family from `mobile-plan.md` §13: session lifecycle, `session_output` subtype routing, PR events, session-group archive events, and queued-message events.
  - Explicitly keep the "ignored in V1 UI but still consumed for store correctness" behavior for non-rendered event families (`message_sent`, `inbox_item_*`, `ticket_*`, `channel_member_*`) so mobile does not fork the data model.
  - The `useOrgEvents` / `useSessionEvents` React hooks stay in `apps/web/src/hooks/`. They become thin wrappers: subscribe via urql, call `handleOrgEvent(event)` on each arrival.
- **Notification hooks:**
  - Registry (`registerHandler`, `notifyForEvent`) is platform-agnostic — move to `packages/client-core/src/notifications/registry.ts`.
  - The actual handlers that call `sonner` or `Notification` API stay in `apps/web/src/notifications/`.
  - Mobile will register its own handlers (expo-notifications) into the same registry.
- **Mutations:**
  - Move `apps/web/src/lib/mutations.ts` → `packages/client-core/src/mutations/index.ts`.
  - Move `apps/web/src/lib/optimistic-message.ts` → `packages/client-core/src/mutations/optimistic-message.ts`.
- **GQL client factory:**
  - Create `packages/client-core/src/gql/createClient.ts`. It exports `createGqlClient({ httpUrl, wsUrl, getAuthHeaders })` that returns a configured urql `Client` with: cache disabled (`exchanges: [dedupExchange, fetchExchange, subscriptionExchange]` — no cacheExchange), WS transport via `graphql-ws`, auth headers injected per request.
  - The fetch impl and WebSocket impl come from `getPlatform()`.
  - Web creates the client once in `apps/web/src/main.tsx` and passes it to urql `Provider`.
- Update all imports in `apps/web`.

## Dependencies

- [02 — Extract Entity Store](02-extract-entity-store.md)
- [03 — Extract Auth Store](03-extract-auth-store.md)

## Completion requirements

- [ ] `packages/client-core/src/events/handlers.ts` contains the pure event-to-store logic
- [ ] Web hooks (`useOrgEvents`, `useSessionEvents`) delegate to client-core handlers
- [ ] V1 event parity is preserved, including non-rendered event families that still need store updates
- [ ] Notification registry is in client-core; web-specific handlers remain in `apps/web`
- [ ] Mutations + optimistic-message helpers are in client-core
- [ ] `createGqlClient` factory is in client-core and used by `apps/web`
- [ ] Unit tests cover the extracted event handlers and `session_output` subtype routing
- [ ] `pnpm typecheck`, `pnpm lint` pass
- [ ] Web app end-to-end behavior unchanged

## How to test

1. `pnpm dev` and exercise web:
   - Log in, see sessions list update live
   - Open a session, see events stream
   - Send a message, see optimistic event then real event
   - Queue a message while agent active, verify chip appears
   - Trigger a status change (e.g., stop session), verify toast fires
2. Run the handler unit tests and cover representative events from each V1 event family, including one non-rendered-but-consumed event.
3. No regressions from §10–14 of `mobile-plan.md` equivalents on web.
