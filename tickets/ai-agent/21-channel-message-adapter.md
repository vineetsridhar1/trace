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

- [ ] Channel routing rules exist in the router (will activate when channel events start flowing)
- [ ] Channel action exists in the registry
- [ ] Channel context building logic exists
- [ ] `ScopeAdapter` interface is defined and implemented for all scope types
- [ ] Documentation exists describing what channel message events must look like for the agent to process them
- [ ] When channel messages are eventually built, adding agent support requires: adding routing entries and implementing the channel scope adapter — no pipeline changes

## How to test

Since channel messages don't exist yet, test with synthetic events:

1. Manually publish a synthetic `message_sent` event with `scopeType: "channel"` to the Redis stream — verify the router forwards it
2. Publish 3 synthetic channel messages in a thread — verify the aggregator batches them correctly
3. Verify the context builder produces a valid context packet for channel scope
4. Verify the scope adapter pattern works by confirming all existing scope types (chat, ticket, session) still function correctly after the refactor
