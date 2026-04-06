# 06 — Zustand Store & Entity Integration

## Summary

Add frontend state management for AI Conversations, Branches, Turns, and shared conversation UI state using the existing Zustand architecture from `plan.md`. urql is transport only, queries hydrate Zustand, scoped subscriptions feed the same event processor, and shared UI state lives in Zustand rather than component-local state.

## What needs to happen

- Create the feature folder under `apps/web/src/features/ai-conversations/` and keep hooks/components/utils/store co-located there
- Register `AiConversation`, `AiBranch`, and `AiTurn` as entity types in the Zustand entity store
- Add entity upsert handlers for each event type:
  - `ai_conversation_created` → upsert `AiConversation` entity
  - `ai_conversation_title_updated` → update title field on existing entity
  - `ai_conversation_visibility_changed` → update visibility field
  - `ai_branch_created` → upsert `AiBranch` entity, update the parent conversation's branch list, the parent branch's `childBranches`, and the fork turn's branch-count metadata
  - `ai_branch_labeled` → update label field on existing branch
  - `ai_turn_created` → upsert `AiTurn` entity, append to the branch's ordered turn IDs, update the branch's turn count, and update conversation activity metadata
- Structure the event processor so later tickets can add field-change handlers for `modelId`, `systemPrompt`, `agentObservability`, summary metadata, and other conversation fields without bypassing the same store pipeline
- Add a small AI Conversations UI slice in Zustand for shared state:
  - active branch ID per conversation
  - pending scroll target turn ID
  - branch switcher open/closed state
- Add typed selectors:
  - `useAiConversation(id)` — returns conversation entity
  - `useAiConversationField(id, field)` — fine-grained field selector
  - `useAiConversations()` — returns list of conversations for the sidebar
  - `useBranch(id)` — returns branch entity
  - `useBranchField(id, field)` — fine-grained field selector
  - `useBranchTurns(branchId)` — returns ordered turn IDs for a branch
  - `useBranchTimeline(branchId)` — returns the derived render timeline for the active branch (inherited turns, local turns, separators, and later summary nodes)
  - `useTurn(id)` — returns turn entity
  - `useTurnField(id, field)` — fine-grained field selector
- Add urql query hooks (transport only — results go into Zustand):
  - `useAiConversationsQuery()` — fetches conversation list, upserts into store
  - `useAiConversationQuery(id)` — fetches single conversation with branches
  - `useBranchTimelineQuery(branchId)` — hydrates the active branch plus any ancestor turns / summary metadata needed to render inherited context
- Add scoped subscription hooks for the active viewport:
  - `useConversationEventsSubscription(conversationId)` — conversation metadata, branch changes, labels, visibility, etc.
  - `useBranchTurnsSubscription(branchId)` — new turns for the active branch
- Add urql mutation hooks:
  - `useCreateAiConversation()` — fire-and-forget, event stream handles store update
  - `useSendTurn()` — fire-and-forget with optimistic update for the user turn
- Handle optimistic updates for `sendTurn`:
  - Immediately add the user turn to the store (optimistic)
  - When the `turn.created` event arrives, reconcile (replace optimistic with server version)
  - If the LLM call fails, remove the optimistic turn or mark it as errored

## Dependencies

- 05 (Event Stream Integration)
  <!-- Ticket 05 creates: 6 EventType enum values (ai_conversation_created, ai_conversation_title_updated, ai_conversation_visibility_changed, ai_branch_created, ai_branch_labeled, ai_turn_created) with ScopeType ai_conversation. Events persist via eventService.create() and broadcast to org-wide stream. Both sendTurn and streamTurn emit events. Scoped subscriptions use separate topics: branchTurns(branchId) delivers Turn objects, conversationEvents(conversationId) delivers AiConversationEvent objects (conversationId, type, payload, timestamp). The conversationEvents subscription returns AiConversationEvent!, not Event!. -->

## Completion requirements

- [x] `AiConversation`, `AiBranch`, and `AiTurn` are registered as entity types in the Zustand store
- [x] All event types correctly upsert/update entities in the store
- [x] Shared AI Conversation UI state lives in Zustand rather than being threaded through component-local state
- [x] `useEntityField`-style selectors exist for all three entity types
- [x] Query hooks hydrate Zustand and the scoped subscription hooks keep the active viewport live
- [x] Mutation hooks are fire-and-forget — store updates come from the event stream
- [x] Optimistic update for `sendTurn` works: user turn appears immediately, reconciles on event <!-- Fixed: reconciliation now happens in processAiConversationEvent and useBranchTurnsSubscription when a USER turn event arrives — finds and replaces optimistic-* entries. -->
- [x] No `useState` for shared state — everything goes through Zustand
- [x] Components using these selectors re-render only when their specific field changes

## How to test

1. Load the app, verify `aiConversations` query fires and populates the Zustand store
2. Create a conversation via mutation — verify the entity appears in the store via the event stream (not the mutation result)
3. Send a turn — verify the user turn appears immediately (optimistic), then the assistant turn appears when the event arrives
4. Update a title — verify the store updates via the event, not the mutation response
5. Switch between two branches — verify the active branch and scroll target move through the Zustand UI slice
6. Open React DevTools, verify no unnecessary re-renders on unrelated field changes
