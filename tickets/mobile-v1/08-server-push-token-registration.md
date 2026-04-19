# 08 — Server: Push Token Registration Schema & Mutations

## Summary

Add database schema, GraphQL mutations, and service-layer methods to register/unregister push notification tokens per user per device. This is required before the mobile app can request push notifications in M5. Landing this early unblocks client work.

## What needs to happen

- **Prisma schema:**
  - Add enum `PushPlatform { ios android }`
  - Add model `PushToken`:
    - `id` (cuid)
    - `userId` (relation to User)
    - `organizationId` (relation to Organization, optional — tokens can be org-scoped)
    - `token` (String, unique per user)
    - `platform` (PushPlatform)
    - `createdAt`, `lastSeenAt`
  - Run migration.
- **GraphQL schema** (`packages/gql/src/schema.graphql`):
  - Add enum `PushPlatform { ios android }`
  - Add mutations:
    - `registerPushToken(token: String!, platform: PushPlatform!): Boolean!`
    - `unregisterPushToken(token: String!): Boolean!`
- **Resolvers** (thin wrappers):
  - `apps/server/src/resolvers/pushTokens.ts`
  - Call service methods `pushTokenService.register({ userId, organizationId, token, platform })` and `unregister(...)`.
- **Service layer:**
  - `apps/server/src/services/pushTokenService.ts`
  - `register()`: upsert on `(userId, token)`, set `lastSeenAt` to now, associate current active org.
  - `unregister()`: delete by `(userId, token)`.
  - `listActiveTokensForUser(userId, organizationId)`: returns tokens to dispatch to (used in ticket 28).
- **Codegen:** `pnpm gql:codegen` to regenerate types.

## Dependencies

None — can land in parallel with M0/M1 client work. Required before M5 push tickets (26, 28).

## Completion requirements

- [ ] Prisma migration creates `push_tokens` table cleanly
- [ ] `registerPushToken` and `unregisterPushToken` mutations exist in schema
- [ ] Service methods upsert and delete correctly, idempotent
- [ ] Regenerated types available in `@trace/gql`
- [ ] Unit tests cover register (upsert semantics), unregister (no-op if absent)

## How to test

1. `pnpm db:migrate` applies cleanly.
2. `pnpm gql:codegen` regenerates types.
3. In GraphQL Playground (authed): `mutation { registerPushToken(token: "test-token", platform: ios) }` → `true`. Call again → still `true`, `lastSeenAt` updated.
4. `mutation { unregisterPushToken(token: "test-token") }` → `true`. Call again → `true` (idempotent).
