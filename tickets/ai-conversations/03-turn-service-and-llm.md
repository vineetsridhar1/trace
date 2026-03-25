# 03 — Turn Service & LLM Integration

## Summary

Build the service for sending turns and getting AI responses. When a user sends a turn, the service stores it, assembles the conversation context (for now, just the current branch's turns since branching isn't built yet), calls the LLM via the existing `LLMAdapter`, and stores the assistant's response as a new turn. This ticket establishes the core chat loop.

## What needs to happen

- Add turn methods to `AiConversationService` (or create a separate `TurnService` if the file gets too large):
  - `sendTurn({ branchId, content, userId })`:
    - Validate the user has access to the conversation
    - Create a `USER` turn with `parentTurnId` pointing to the last turn in the branch (or null if first)
    - Assemble context: for now, all turns in the branch in order (branching context assembly comes in ticket 10)
    - Call the LLM via `LLMAdapter` with the assembled turns as messages
    - Create an `ASSISTANT` turn with the LLM response, `parentTurnId` pointing to the user turn
    - Update the conversation's `updatedAt`
    - Return both the user turn and assistant turn
  - `getTurns(branchId)`:
    - Return all turns in a branch ordered by `createdAt`
  - `getTurn(turnId)`:
    - Return a single turn with its branch info
- Integrate with the existing `LLMAdapter` interface:
  - Map turns to the LLM message format (`{ role, content }`)
  - Use the conversation's configured model (default to org model for now — model selection comes in ticket 09)
  - Support streaming responses — the assistant turn should be created with partial content and updated as chunks arrive, or created after the full response is received (implementation choice)
- Handle LLM errors gracefully:
  - If the LLM call fails, do NOT create an assistant turn
  - Return an error that the frontend can display inline

## Dependencies

- 02 (AI Conversation Service)
  <!-- Ticket 02 creates: AiConversationService with createConversation, getConversation, getBranch, getBranches, getBranchDepth, updateTitle. Mutating methods follow the standard (input, actorType, actorId) signature. -->

## Completion requirements

- [x] `sendTurn` creates a user turn, calls the LLM, and creates an assistant turn
- [x] Turns are linked via `parentTurnId` forming a correct chain
- [x] LLM receives the full conversation history as context
- [x] LLM adapter is called with the correct model and message format
- [x] Failed LLM calls do not leave orphaned user turns without responses (either rollback or mark as error)
- [x] `getTurns` returns turns in correct chronological order
- [x] Conversation `updatedAt` is updated on each new turn

## How to test

1. Create a conversation, send a turn with content "Hello" — verify a user turn and assistant turn are created
2. Send a second turn — verify `parentTurnId` chain is correct (turn2.user → turn1.assistant → turn1.user)
3. Call `getTurns` — verify all turns returned in order
4. Simulate an LLM failure — verify no assistant turn is created and an error is returned
5. Verify the LLM receives the full conversation history on each call
