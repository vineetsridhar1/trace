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

- The router's in-memory chat membership set (from ticket 04) is already initialized on worker startup via `seedChatMembershipGate()` and updated in real-time by `updateChatMembership()` — no additional work needed for membership tracking
  <!-- Note: The ChatMember table stores userId which references User.id. For the agent to be a chat member, either the agent's AgentIdentity.id must be inserted into ChatMember.userId (requires ChatService changes to accept agent actors), or a synthetic User row must exist for the agent. This ticket must resolve how agents become chat members at the DB level. -->
- When the agent is removed from a chat, immediately stop all processing for that chat (close any open aggregation windows via aggregator API from ticket #05)

### Privacy guard

- The context builder must never include DM message content in context packets for other scopes
- Summaries for DMs are only generated on explicit user request, not automatically
- Group chat summaries are generated automatically but never leaked into unrelated contexts

## Dependencies

- 15 (Pipeline Integration — the pipeline must be working end-to-end)
- 16 (Tier 3 Planner & Promotion)
  <!-- Ticket 16 created: The router now promotes @mentions of the agent to Tier 3 (`router.ts:90-101`). This means every DM message to the agent triggers Tier 3 (Opus-class model) since DMs are essentially @mentions. For simple DM queries ("what's the status of TK-142?"), this is wasteful. Consider: (1) suppress Tier 3 for DM-scoped @mentions by adding `event.scopeType !== "chat"` to the message_sent Tier 3 rule, or (2) let DMs default to Tier 2 and only promote when the Tier 2 planner requests escalation via `promotionReason`. Option 2 is recommended — it lets the model decide whether it needs Opus. -->

## Completion requirements

- [x] DM messages to the agent produce a direct reply (not a suggestion) — `router.ts:376-382` routes DMs direct; `planner.ts:232-238` instructs act+message.send; `policy-engine.ts:84` blocks unsolicited suggestions
- [x] DMs bypass aggregation — `router.ts:376-382` returns `direct` for DM `message_sent`
- [x] Group chat messages are aggregated and produce suggestions via InboxItem — unchanged; falls through to `AGGREGATE_EVENT_TYPES` at `router.ts:391`
- [x] Group chat rate limiting is enforced (1/hour) — `policy-engine.ts:76` (`chat: 1`), wired via `isDm` flag
- [x] @mentions in group chats bypass aggregation — `router.ts:59-65` DIRECT_RULES for mentions
- [x] Chat membership set is initialized on startup and updated in real-time — `agent-worker.ts:250-277` seeds with types; `router.ts:164-186` updates on events
- [x] Removing the agent from a chat immediately stops observation — `agent-worker.ts:401-416` closes windows; `router.ts:177-185` removes membership
- [x] DM content never appears in context for other scopes — `context-builder.ts:495-497` filters DM linked entities; `context-builder.ts:822-831` skips DM auto-summaries

## How to test

1. DM the agent asking "what's the status of TK-142?" — verify it replies directly in the DM within seconds
2. Discuss a bug in a group chat where the agent is a member — verify a suggestion (not a direct reply) appears after the conversation settles
3. @mention the agent in a group chat with a question — verify it replies directly
4. Remove the agent from a group chat — verify it immediately stops processing events from that chat
5. Check context packets for ticket-scoped events — verify no DM content is included
