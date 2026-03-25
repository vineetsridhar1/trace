# 09 — Conversation Creation & Model Selection

## Summary

Build the conversation creation flow and per-conversation model selection. Users can start a new conversation from the conversations list or via a keyboard shortcut, optionally selecting a model and system prompt. The default model comes from the org's configuration.

## What needs to happen

- Add a "New Conversation" button to the conversations list header
  - Clicking it creates a conversation and navigates to the conversation view immediately
  - The conversation starts untitled — title is set later (auto-titling in ticket 22, or manual edit)
- Add a keyboard shortcut for new conversation (e.g., Cmd+Shift+N or similar)
- Add model selection to `AiConversation`:
  - Extend the Prisma schema: add `modelId` field (String, optional — null means use org default)
  - Extend the GraphQL schema: add `modelId` to `AiConversation` type and `CreateAiConversationInput`
  - Run migration
- Create a model picker component:
  - Dropdown or popover in the conversation header showing available models
  - Shows the current model (or "Default" if using org default)
  - Selecting a model updates the conversation's `modelId`
  - Available models come from the org's LLM adapter configuration
- Add system prompt support:
  - Extend Prisma schema: add `systemPrompt` field (String, optional) to `AiConversation`
  - Extend GraphQL schema: add `systemPrompt` to type and input
  - Run migration
  - The system prompt is prepended to the context when calling the LLM
  - Add a settings panel (gear icon in conversation header) where users can view/edit the system prompt
- Update `sendTurn` in the service layer to:
  - Use the conversation's `modelId` when calling the LLM (falling back to org default)
  - Include the system prompt in the LLM call if set
- Add `updateAiConversation` mutation for updating model and system prompt

## Dependencies

- 08 (Conversation View & Turn Rendering)
  <!-- Ticket 08 creates: ConversationView, TurnList, TurnInput — the conversation UI shell -->

## Completion requirements

- [ ] "New Conversation" button creates a conversation and navigates to it
- [ ] Keyboard shortcut works for creating a new conversation
- [ ] Model picker shows available models and the current selection
- [ ] Changing the model persists and is used for subsequent LLM calls
- [ ] System prompt field exists and is editable via a settings panel
- [ ] System prompt is included in LLM calls when set
- [ ] Default model falls back to org configuration when not set
- [ ] Prisma migration runs cleanly for new fields

## How to test

1. Click "New Conversation" — a new conversation is created and the view opens with empty state
2. Open the model picker — available models are listed
3. Select a different model, send a turn — verify the response comes from the selected model
4. Set a system prompt "Always respond in French", send "Hello" — verify the AI responds in French
5. Create a conversation without setting a model — verify it uses the org default
