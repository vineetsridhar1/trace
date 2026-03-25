# 06 — Zustand Store & Entity Integration

## Summary

Add frontend state management for AI Conversations, Branches, and Turns using the existing Zustand entity store pattern. Following Trace conventions: urql is transport only, all state lives in Zustand, components use `useEntityField` selectors for fine-grained re-renders. Events from the org-wide subscription drive all state updates — mutation results are never used to update the store.

## What needs to happen

- Register `AiConversation`, `Branch`, and `Turn` as entity types in the Zustand entity store
- Add entity upsert handlers for each event type:
  - `ai_conversation.created` → upsert `AiConversation` entity
  - `ai_conversation.title_updated` → update title field on existing entity
  - `ai_conversation.visibility_changed` → update visibility field
  - `branch.created` → upsert `Branch` entity, update parent conversation's branch list
  - `branch.labeled` → update label field on existing branch
  - `turn.created` → upsert `Turn` entity, update parent branch's turn count
- Add typed selectors:
  - `useAiConversation(id)` — returns conversation entity
  - `useAiConversationField(id, field)` — fine-grained field selector
  - `useAiConversations()` — returns list of conversations for the sidebar
  - `useBranch(id)` — returns branch entity
  - `useBranchField(id, field)` — fine-grained field selector
  - `useBranchTurns(branchId)` — returns ordered turn IDs for a branch
  - `useTurn(id)` — returns turn entity
  - `useTurnField(id, field)` — fine-grained field selector
- Add urql query hooks (transport only — results go into Zustand):
  - `useAiConversationsQuery()` — fetches conversation list, upserts into store
  - `useAiConversationQuery(id)` — fetches single conversation with branches
  - `useBranchTurnsQuery(branchId)` — fetches turns for a branch
- Add urql mutation hooks:
  - `useCreateAiConversation()` — fire-and-forget, event stream handles store update
  - `useSendTurn()` — fire-and-forget with optimistic update for the user turn
- Handle optimistic updates for `sendTurn`:
  - Immediately add the user turn to the store (optimistic)
  - When the `turn.created` event arrives, reconcile (replace optimistic with server version)
  - If the LLM call fails, remove the optimistic turn or mark it as errored

## Dependencies

- 05 (Event Stream Integration)
  <!-- Ticket 05 creates: Event types and emission for all conversation/branch/turn mutations -->

## Completion requirements

- [ ] `AiConversation`, `Branch`, and `Turn` are registered as entity types in the Zustand store
- [ ] All event types correctly upsert/update entities in the store
- [ ] `useEntityField`-style selectors exist for all three entity types
- [ ] Query hooks fetch data and upsert into Zustand (urql cache is not used for state)
- [ ] Mutation hooks are fire-and-forget — store updates come from the event stream
- [ ] Optimistic update for `sendTurn` works: user turn appears immediately, reconciles on event
- [ ] No `useState` for shared state — everything goes through Zustand
- [ ] Components using these selectors re-render only when their specific field changes

## How to test

1. Load the app, verify `aiConversations` query fires and populates the Zustand store
2. Create a conversation via mutation — verify the entity appears in the store via the event stream (not the mutation result)
3. Send a turn — verify the user turn appears immediately (optimistic), then the assistant turn appears when the event arrives
4. Update a title — verify the store updates via the event, not the mutation response
5. Open React DevTools, verify no unnecessary re-renders on unrelated field changes
