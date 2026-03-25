# 22 — Agent-Powered Conversation Features

## Summary

Implement the ambient agent's AI-powered features for conversations: auto-titling, branch label suggestions, ticket creation from conversations, cross-entity linking, and suggested branches. These features build on the agent observation pipeline from ticket 21 and use the existing agent infrastructure (planner, action executor, suggestion delivery) from the ai-agent tickets.

## What needs to happen

### Auto-Titling
- Register a new agent action: `ai_conversation.set_title`
- When observability is `SUGGEST` or `PARTICIPATE` and a conversation has no title after 2-3 exchanges:
  - The agent generates a concise title from the conversation content
  - Creates a suggestion (via `SUGGEST` mode) or directly sets the title (`PARTICIPATE` mode)
  - User can edit or dismiss the suggested title
- The title generation prompt should produce short, descriptive titles (not questions or sentences)

### Branch Label Suggestions
- Register a new agent action: `branch.suggest_label`
- When a branch is created without a label and the branch gets its first turn:
  - The agent observes the first turn content
  - Suggests a short label (2-5 words) that captures the tangent topic
  - In `SUGGEST` mode: shows as a dismissible suggestion near the branch name
  - In `PARTICIPATE` mode: sets the label directly
- The user can always override or dismiss

### Ticket Creation from Conversations
- Register a new agent action: `ticket.create_from_conversation`
- When observability is `SUGGEST` or `PARTICIPATE`:
  - The agent monitors for decisions, bug reports, or actionable insights in the conversation
  - Surfaces a suggestion to create a ticket, pre-populated with:
    - Title derived from the conversation topic
    - Description with relevant context from the conversation
    - Link back to the conversation/branch
  - This reuses the existing suggestion delivery system from ai-agent ticket 14
- In `SUGGEST` mode: creates a suggestion InboxItem
- In `PARTICIPATE` mode: posts a turn with an inline "Create ticket" action

### Cross-Entity Linking
- Register a new agent action: `ai_conversation.link_entity`
- The agent monitors conversation content for references to existing tickets or sessions
- When a match is found: "This sounds related to TRACE-142 — want to link it?"
- If accepted, creates a link between the conversation and the ticket/session
- Add `linkedEntities` field to `AiConversation` (or use a join table):
  - `entityType` (Ticket, Session, etc.)
  - `entityId`

### Suggested Branches
- Register a new agent action: `branch.suggest`
- In `PARTICIPATE` mode only:
  - The agent can proactively suggest branching when the conversation touches on a tangent
  - Posts an assistant turn: "There's a different angle worth investigating — want me to open a branch?"
  - The turn includes a one-tap "Create branch" action button
  - Clicking it calls `forkBranch` from the turn where the suggestion was made

## Dependencies

- 21 (Agent Conversation Observation)
  <!-- Ticket 21 creates: agentObservability field, event routing to agent pipeline, OFF/SUGGEST/PARTICIPATE levels -->
- 14 (Branch Labels)
  <!-- Ticket 14 creates: labelBranch service/mutation, auto-label logic, inline label editing -->
- 09 (Conversation Creation & Model Selection)
  <!-- Ticket 09 creates: conversation creation flow, updateAiConversation mutation, model/system prompt fields -->

## Completion requirements

- [ ] Auto-titling generates a title after 2-3 exchanges (when observability is enabled)
- [ ] Branch label suggestions appear when a new branch gets its first turn
- [ ] Ticket creation suggestions surface for actionable content
- [ ] Cross-entity linking detects references to existing tickets/sessions
- [ ] Suggested branches appear in `PARTICIPATE` mode with one-tap creation
- [ ] All features respect the observability level (`OFF` = nothing, `SUGGEST` = suggestions only, `PARTICIPATE` = direct actions)
- [ ] All actions are registered in the action registry
- [ ] Suggestions use the existing InboxItem delivery system

## How to test

1. Create a conversation with `SUGGEST` observability, exchange 3 turns — title suggestion appears
2. Accept the title — conversation is titled
3. Create a branch without a label, send a turn — label suggestion appears
4. Discuss a bug in the conversation — ticket creation suggestion appears
5. Mention an existing ticket by name — cross-entity linking suggestion surfaces
6. Set observability to `PARTICIPATE` — agent posts suggested branches inline
7. Click "Create branch" on a suggested branch — branch is created
8. Set observability to `OFF` — verify none of these features trigger
