# 21 — Agent Conversation Observation

## Summary

Wire AI Conversations into the ambient agent's event stream with opt-in observability. By default, private conversations are not observed by the agent. Users can configure per-conversation agent observability with three levels: `off` (default), `suggest` (agent reads but doesn't post), and `participate` (agent is a third voice). This ticket handles the plumbing — the actual agent features come in ticket 22.

## What needs to happen

- Add `agentObservability` field to the `AiConversation` model:
  - Enum: `OFF`, `SUGGEST`, `PARTICIPATE` — default `OFF`
  - Prisma migration
  - Add to GraphQL type and update mutation
- Add `updateAgentObservability` service method and mutation:
  - `updateAgentObservability({ conversationId, level, userId })`:
    - Validate user is the conversation creator
    - Update the field
    - Emit `ai_conversation.agent_observability_changed` event
  - GraphQL: `updateAgentObservability(conversationId: ID!, level: AgentObservability!): AiConversation!`
- Add the `AgentObservability` enum to GraphQL schema
- Wire conversation events into the agent's event router:
  - The event router (from ai-agent ticket 04) should receive conversation events
  - The router checks the conversation's `agentObservability` level:
    - `OFF`: drop the event entirely — agent never sees it
    - `SUGGEST`: route the event to the agent pipeline for observation/suggestion generation
    - `PARTICIPATE`: route the event and allow the agent to post turns
  - Events routed: `turn.created`, `branch.created`, `ai_conversation.title_updated`
- Add UI for configuring agent observability:
  - Settings panel (gear icon) in the conversation header
  - Three-option selector: Off / Suggest / Participate
  - Description for each level so the user understands what they're enabling
  - Show current level with an icon (eye-off for off, eye for suggest, user-plus for participate)

## Dependencies

- 05 (Event Stream Integration)
  <!-- Ticket 05 creates: Event types and emission for all conversation mutations, org-wide event stream -->

## Completion requirements

- [ ] `agentObservability` field exists on `AiConversation` with default `OFF`
- [ ] `updateAgentObservability` mutation works and emits an event
- [ ] Event router correctly filters conversation events based on observability level
- [ ] `OFF` conversations produce zero agent-visible events
- [ ] `SUGGEST` conversations route events but agent cannot post turns
- [ ] `PARTICIPATE` conversations allow the agent to post turns
- [ ] Settings UI shows the three levels with descriptions
- [ ] Current observability level is indicated in the conversation header

## How to test

1. Create a conversation (default `OFF`) — verify no events reach the agent pipeline
2. Set observability to `SUGGEST` — send a turn, verify the event reaches the agent pipeline
3. Set observability to `PARTICIPATE` — verify the agent can create turns in the conversation
4. Toggle back to `OFF` — verify events stop flowing to the agent
5. Verify the settings UI correctly shows and updates the level
6. Verify the event router does not leak events from `OFF` conversations
