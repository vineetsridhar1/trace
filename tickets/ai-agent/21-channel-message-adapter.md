# 21 — Channel Message Adapter

## Summary

Channel messages aren't built yet, but the agent pipeline should be ready for them. This ticket pre-wires the agent to handle channel-scoped events so that when channel messages are implemented, plugging them into the agent requires minimal work.

## What needs to happen

### What should already work (from prior tickets)

If the prior tickets were implemented correctly, the following should already be in place:
- `ScopeType` enum includes `channel`
- Router handles `channel` scope type (currently drops unknown event types — just needs entries added)
- Aggregator builds scope keys for channels: `channel:{channelId}:thread:{threadId}`
- Context builder handles `channel` scope via the generic switch/strategy
- Entity summaries support `entityType: "channel"`
- Action registry includes `message.send` (will need a channel variant)

### What this ticket adds

- Add channel-specific routing rules to the router:
  - `message_sent` in channel scope → aggregate
  - `message_edited` in channel scope → aggregate
  - `channel_created` → drop (not actionable by agent)
- Add a `message.sendToChannel` action to the registry (or extend `message.send` to accept both chat and channel targets) — wired to whatever service method channel messages will use
- Add channel-specific context building:
  - Fetch channel entity and members
  - Fetch channel summary
  - Search for relevant tickets based on message content
- Set default autonomy mode for channels to the org default (channels are team-visible, no special privacy restrictions like DMs)
- Rate limit: max 2 suggestions per thread per hour for channels
- Document what the channel message implementation needs to emit for the agent to work:
  - Events with `scopeType: "channel"`, `scopeId: channelId`
  - Thread ID in `metadata.threadId` for threaded messages
  - Message content in `payload.content`

### Adapter pattern

Create a lightweight `ScopeAdapter` interface that encapsulates scope-specific behavior:
- `fetchEntity(scopeId)` — get the scope entity
- `fetchParticipants(scopeId)` — get relevant actors
- `getDefaultAutonomyMode()` — scope type default
- `getRateLimit()` — suggestions per hour
- `buildScopeKey(event)` — construct the aggregation key

Implement adapters for `chat`, `ticket`, `session`, and `channel`. The context builder and policy engine use these adapters instead of hardcoded switches.
<!-- Ticket 17 created: The chat scope adapter must handle DM vs group chat distinction. Use `ChatType` from `router.ts` and `AgentContextPacket.isDm`. Chat adapter's `getDefaultAutonomyMode()` should return `observe` for DMs and `suggest` for group chats. Chat adapter's `getRateLimit()` should return 0 for DMs (no unsolicited suggestions) and 1 for group chats. Privacy: the chat adapter should indicate DMs have restricted context sharing (no auto-summaries, no linked entity exposure). -->

## Dependencies

- 15 (Pipeline Integration — pipeline must be complete)

## Completion requirements

- [x] Channel routing rules exist in the router (will activate when channel events start flowing) — `channel_created` added to `LOW_VALUE_EVENT_TYPES` in `router.ts`; `message_sent`/`message_edited` already in `AGGREGATE_EVENT_TYPES`
- [x] Channel action exists in the registry — `message.sendToChannel` registered in `action-registry.ts`
- [x] Channel context building logic exists — channel scope fetcher enhanced with member fetching in `context-builder.ts`
- [x] `ScopeAdapter` interface is defined and implemented for all scope types — `scope-adapter.ts` with chat, ticket, session, channel adapters; wired into aggregator and policy engine
- [x] Documentation exists describing what channel message events must look like for the agent to process them — `CHANNEL_EVENTS.md`
- [~] When channel messages are eventually built, adding agent support requires: adding routing entries and implementing the channel scope adapter — no pipeline changes — **Mostly done.** One remaining gap: `executor.ts` needs a `channelService` dispatch case and `ServiceContainer` needs the type. Without this, `message.sendToChannel` will fail at runtime. This is a small addition when channel messages are built.

## Implementation notes

<!-- Added after implementation -->
- **ScopeAdapter interface** is lighter than the spec: includes `buildScopeKey`, `getDefaultAutonomyMode`, `getRateLimit` but omits `fetchEntity` and `fetchParticipants`. Entity fetching remains in the context builder's `scopeFetchers` map to avoid coupling the adapter to Prisma/database concerns. This keeps adapters pure-logic and easy to test.
- **Aggregator refactored** to delegate scope key construction to adapters via `getScopeAdapter()` instead of hardcoded switch.
- **Policy engine** updated: channel suggestion rate limit set to 2/thread/hour; rate limiter now uses `scopeKey` for per-thread granularity.
- **Channel context builder** now fetches active members (`where: { leftAt: null }`) with user id/name.
- **Executor gap**: `channelService` is not yet in the executor's `ServiceContainer` or `dispatch()` method. This is intentional — the channel message service API isn't finalized yet. When channel messages are built, add `channelService` to `ServiceContainer` and a dispatch case in `executor.ts`.

## How to test

Since channel messages don't exist yet, test with synthetic events:

1. Manually publish a synthetic `message_sent` event with `scopeType: "channel"` to the Redis stream — verify the router forwards it
2. Publish 3 synthetic channel messages in a thread — verify the aggregator batches them correctly
3. Verify the context builder produces a valid context packet for channel scope
4. Verify the scope adapter pattern works by confirming all existing scope types (chat, ticket, session) still function correctly after the refactor
