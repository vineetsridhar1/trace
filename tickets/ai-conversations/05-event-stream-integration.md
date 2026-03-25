# 05 — Event Stream Integration

## Summary

Wire AI Conversation actions into the Trace event stream. Every mutation that changes state must emit an event through the existing event infrastructure. Events flow through the same org-wide event stream used by Channels, Sessions, and Tickets — enabling real-time UI updates and (later) agent observation.

## What needs to happen

- Define new event types for AI Conversations:
  - `ai_conversation.created` — payload: `{ conversationId, title, visibility, createdById }`
  - `ai_conversation.title_updated` — payload: `{ conversationId, title }`
  - `ai_conversation.visibility_changed` — payload: `{ conversationId, visibility }`
  - `branch.created` — payload: `{ branchId, conversationId, parentBranchId, forkTurnId, label }`
  - `branch.labeled` — payload: `{ branchId, conversationId, label }`
  - `turn.created` — payload: `{ turnId, branchId, conversationId, role, content }`
- Add these event types to the existing event type enum/registry
- Update `AiConversationService` methods to emit events after successful mutations:
  - `createConversation` → emit `ai_conversation.created` + `branch.created` (for root branch)
  - `updateTitle` → emit `ai_conversation.title_updated`
  - `sendTurn` → emit `turn.created` for both user and assistant turns
- Events must include `organizationId` and `actorId` for the org-wide event stream
- Events must include enough data in the payload for the frontend to upsert entities without refetching
- Wire the `branchTurns` subscription to emit turn events for the subscribed branch
- Wire a `conversationEvents` subscription for conversation-level events (title changes, new branches)

## Dependencies

- 04 (GraphQL Schema & Resolvers)
  <!-- Ticket 04 creates: GraphQL types, mutations, subscriptions for conversations/branches/turns -->

## Completion requirements

- [ ] All six event types are defined and registered
- [ ] `createConversation` emits both `ai_conversation.created` and `branch.created`
- [ ] `sendTurn` emits `turn.created` for each turn (user and assistant)
- [ ] `updateTitle` emits `ai_conversation.title_updated`
- [ ] Event payloads contain enough data to upsert the full entity in the Zustand store
- [ ] Events flow through the org-wide event stream (same infrastructure as other entities)
- [ ] `branchTurns` subscription correctly filters and emits only events for the subscribed branch
- [ ] Events include `organizationId` and `actorId`

## How to test

1. Subscribe to the org event stream, create a conversation — verify `ai_conversation.created` and `branch.created` events arrive
2. Send a turn — verify two `turn.created` events arrive (user + assistant)
3. Update a title — verify `ai_conversation.title_updated` event arrives
4. Subscribe to `branchTurns` for branch A, send a turn in branch A — event arrives. Send a turn in branch B — no event (correct filtering)
