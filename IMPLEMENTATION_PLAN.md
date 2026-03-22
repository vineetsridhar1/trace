# Channel Types & Membership — Implementation Plan

## Summary

Transform channels from session-only containers into typed, membership-gated spaces. Two channel types to start: **text** (messaging) and **coding** (sessions — current behavior). Add explicit channel membership with join/leave, a channel browser for discovery, and type-specific rendering.

## Decisions (confirmed)

- Existing channels migrate to `coding` type
- Users can browse all org channels and join them (channel browser UI)
- Text channels use the existing event-based `sendMessage` mutation (not the chat Message model)

---

## Phase 1: Prisma Schema

**File:** `apps/server/prisma/schema.prisma`

### 1a. Update `ChannelType` enum
```
enum ChannelType {
  text
  coding
}
```
Migration SQL maps `default` → `coding`, drops `announcement`/`triage`/`feed`.

### 1b. Add `ChannelMember` model (mirrors `ChatMember`)
```prisma
model ChannelMember {
  channelId       String
  organizationId  String
  channel         Channel  @relation(fields: [channelId, organizationId], references: [id, organizationId], onDelete: Cascade)
  userId          String
  user            User     @relation(fields: [userId, organizationId], references: [id, organizationId], onDelete: Cascade)
  joinedAt        DateTime @default(now())
  leftAt          DateTime?

  @@id([channelId, userId])
  @@index([organizationId])
  @@index([userId])
}
```

### 1c. Update `Channel` model
- Add `members ChannelMember[]` relation
- Add `@@unique([id, organizationId])` compound unique (required for ChannelMember FK)
- Change default type from `default` to `coding`

### 1d. Update `User` model
- Add `channelMemberships ChannelMember[]` relation

### 1e. Run migration
`pnpm db:migrate` then `pnpm db:generate`

---

## Phase 2: GraphQL Schema

**File:** `packages/gql/src/schema.graphql`

### 2a. Update `ChannelType` enum
```graphql
enum ChannelType {
  text
  coding
}
```

### 2b. Add `ChannelMember` type
```graphql
type ChannelMember {
  user: User!
  joinedAt: DateTime!
}
```

### 2c. Update `Channel.members` field
Change from `[User!]!` to `[ChannelMember!]!`

### 2d. Add mutations
```graphql
joinChannel(channelId: ID!): Channel!
leaveChannel(channelId: ID!): Channel!
```

### 2e. Add `channel_member_added` and `channel_member_removed` to EventType enum
Matches the `chat_member_added`/`chat_member_removed` pattern.

### 2f. Run codegen
`pnpm gql:codegen`

---

## Phase 3: Service Layer

**File:** `apps/server/src/services/channel.ts`

### 3a. Update `create()` — auto-join creator
After creating the channel within the transaction:
- Create `ChannelMember` record for the actor
- Create `Participant` record (auto-subscription)
- Include `members` array in the `channel_created` event payload

### 3b. Add `join(channelId, userId, actorType, actorId)` method
- Validate user belongs to the org
- Handle rejoin (reset `leftAt` to null) or create new `ChannelMember`
- Upsert `Participant` subscription
- Emit `channel_member_added` event with `{ userId, channel: { id, name, type, members } }`

### 3c. Add `leave(channelId, userId, actorType, actorId)` method
- Verify current membership (`leftAt: null`)
- Set `leftAt = now()` on `ChannelMember`
- Delete `Participant` record
- Emit `channel_member_removed` event with `{ userId, channel: { id, name, type, members } }`

### 3d. Update channel queries
Support a `memberOnly` filter so the sidebar fetches only joined channels, while the browser shows all.

---

## Phase 4: GraphQL Resolvers

**File:** `apps/server/src/schema/channel.ts`

### 4a. Add `Channel.members` type resolver
Resolve from `ChannelMember` with `leftAt: null`, include user.

### 4b. Add `joinChannel` / `leaveChannel` mutation resolvers
Delegate to `channelService.join()` / `channelService.leave()`

### 4c. Register type resolvers
Export and merge `channelTypeResolvers` in `apps/server/src/schema/resolvers.ts`

---

## Phase 5: Frontend Event Handling

**File:** `apps/web/src/hooks/useOrgEvents.ts`

### 5a. Handle `channel_member_added`
- If `payload.userId === currentUser`: upsert the full channel entity (appears in sidebar)
- Otherwise: patch the channel's `members` array

### 5b. Handle `channel_member_removed`
- If `payload.userId === currentUser`: remove channel from store, navigate away if active
- Otherwise: patch the channel's `members` array

---

## Phase 6: Sidebar Updates

### 6a. `ChannelItem.tsx` — type-specific icons
- `MessageSquare` for text, `Code` for coding (replace `Hash`)

### 6b. `AppSidebar.tsx` — membership-filtered query
- Update `CHANNELS_QUERY` to include `members` and pass `memberOnly: true`

### 6c. New: `BrowseChannelsDialog.tsx`
- Dialog to discover and join all org channels
- Shows name, type, member count, join/leave button

---

## Phase 7: ChannelView Type Switching

### 7a. `ChannelView.tsx` — branch by type
Read channel type, render `TextChannelView` or `CodingChannelView`

### 7b. New: `CodingChannelView.tsx`
Extract current ChannelView rendering (sessions table + start session dialog)

### 7c. New: `TextChannelView.tsx`
- Header with channel name + MessageSquare icon
- Message list via `useScopedEventIds("channel:${channelId}")`
- Composer calling `sendMessage` mutation

---

## Phase 8: CreateChannelDialog

- Add type selector (shadcn RadioGroup): `coding` (default) and `text`
- Pass selected type in mutation input

---

## File Change Summary

| File | Change |
|------|--------|
| `apps/server/prisma/schema.prisma` | Update ChannelType enum, add ChannelMember model, update Channel & User |
| `packages/gql/src/schema.graphql` | Update ChannelType, add ChannelMember type, add mutations, add event types |
| `apps/server/src/services/channel.ts` | Add join(), leave(), auto-join on create, membership query support |
| `apps/server/src/schema/channel.ts` | Add joinChannel/leaveChannel resolvers, Channel.members resolver |
| `apps/server/src/schema/resolvers.ts` | Register channel type resolvers |
| `apps/web/src/hooks/useOrgEvents.ts` | Handle channel_member_added/removed events |
| `apps/web/src/components/sidebar/ChannelItem.tsx` | Type-specific icons |
| `apps/web/src/components/sidebar/CreateChannelDialog.tsx` | Add type selector |
| `apps/web/src/components/AppSidebar.tsx` | Membership-filtered query, browse button |
| `apps/web/src/components/sidebar/BrowseChannelsDialog.tsx` | **New** — channel discovery UI |
| `apps/web/src/components/channel/ChannelView.tsx` | Branch by type |
| `apps/web/src/components/channel/CodingChannelView.tsx` | **New** — extracted from current ChannelView |
| `apps/web/src/components/channel/TextChannelView.tsx` | **New** — message feed for text channels |
