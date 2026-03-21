# 17 — Chat & DM Observation

## Summary

Make the agent fully functional in DMs and group chats. The router and aggregator already handle chat scope types, but the agent needs specific behavior tuning for private conversations: reactive in DMs, moderately proactive in group chats.

## What needs to happen

### DM behavior

- When a user sends a message in a DM with the agent, it should be treated as a direct request (Path D: explicit request path)
- Bypass aggregation for DMs — respond promptly
- The planner should receive extra context indicating this is a direct 1:1 conversation with the agent
- The agent should respond to DM messages by default (no suggestion — just reply in the DM)
- The agent's reply uses `chatService.sendMessage()` as the agent actor

### Group chat behavior

- Group chats where the agent is a member should be treated like quieter channels
- Default autonomy mode for group chats is `suggest`
- Rate limit: max 1 suggestion per hour per group chat (lower than channels)
- @mentions of the agent in group chats should bypass aggregation and get direct planner processing

### Membership management

- The router's in-memory chat membership set (from ticket 04) should be initialized on worker startup by querying all chats where the agent is an active member
- The set updates in real-time as `chat_member_added` / `chat_member_removed` events arrive
- When the agent is removed from a chat, immediately stop all processing for that chat (close any open aggregation windows)

### Privacy guard

- The context builder must never include DM message content in context packets for other scopes
- Summaries for DMs are only generated on explicit user request, not automatically
- Group chat summaries are generated automatically but never leaked into unrelated contexts

## Dependencies

- 15 (Pipeline Integration — the pipeline must be working end-to-end)

## Completion requirements

- [ ] DM messages to the agent produce a direct reply (not a suggestion)
- [ ] DMs bypass aggregation
- [ ] Group chat messages are aggregated and produce suggestions via InboxItem
- [ ] Group chat rate limiting is enforced (1/hour)
- [ ] @mentions in group chats bypass aggregation
- [ ] Chat membership set is initialized on startup and updated in real-time
- [ ] Removing the agent from a chat immediately stops observation
- [ ] DM content never appears in context for other scopes

## How to test

1. DM the agent asking "what's the status of TK-142?" — verify it replies directly in the DM within seconds
2. Discuss a bug in a group chat where the agent is a member — verify a suggestion (not a direct reply) appears after the conversation settles
3. @mention the agent in a group chat with a question — verify it replies directly
4. Remove the agent from a group chat — verify it immediately stops processing events from that chat
5. Check context packets for ticket-scoped events — verify no DM content is included
