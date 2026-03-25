# 18 — Visibility & Sharing

## Summary

Implement the visibility model for AI Conversations. Conversations are private by default (visible only to the creator). Users can publish a conversation to the org, making it readable by all org members. Org-visible conversations are read-only for non-creators — other members can view the full tree but cannot add turns. Sharing a direct link to a specific branch is also supported.

## What needs to happen

- Add `updateAiConversationVisibility` service method and mutation:
  - `updateVisibility({ conversationId, visibility, userId })`:
    - Validate the requesting user is the conversation creator
    - Update the `visibility` field
    - Emit `ai_conversation.visibility_changed` event
  - GraphQL: `updateAiConversationVisibility(conversationId: ID!, visibility: AiConversationVisibility!): AiConversation!`
- Update access control in the service layer:
  - `getConversation`: allow org members to read `ORG`-visible conversations
  - `sendTurn`: only allow the conversation creator (even for org-visible conversations)
  - `forkBranch`: only allow the conversation creator for the same conversation (org members can fork via `forkAiConversation` — ticket 19)
  - `labelBranch`, `updateTitle`: only the creator
- Add visibility toggle to the conversation UI:
  - In the conversation header/settings, add a toggle: Private ↔ Org
  - Show a confirmation when switching to Org ("This will make the conversation visible to all org members")
  - Show current visibility status with an icon (lock for private, globe for org)
- Update the conversations list:
  - Add a "Shared" tab/filter showing org-visible conversations from other members
  - Shared conversations show the creator's name
  - Visually distinguish shared conversations (different background or icon)
- Add shareable branch links:
  - URL format: `/conversations/:conversationId/branch/:branchId`
  - Opening a branch link in the same org navigates directly to that branch
  - If the conversation is private and the viewer is not the creator, show an "Access denied" message
- Read-only mode for non-creators viewing org-visible conversations:
  - Turn input is hidden (or disabled with a message like "Fork to continue this conversation")
  - Fork button is replaced with "Fork to your conversations" (leads to ticket 19)

## Dependencies

- 07 (Conversations Sidebar & List)
  <!-- Ticket 07 creates: the list UI that needs shared/private visibility treatment -->
- 08 (Conversation View & Turn Rendering)
  <!-- Ticket 08 creates: ConversationView, TurnList, TurnInput — the conversation UI -->
- 11 (Branch Forking UI)
  <!-- Ticket 11 creates: fork affordances that must switch to read-only / fork-to-my-conversations for shared views -->

## Completion requirements

- [ ] Visibility toggle works: Private ↔ Org with confirmation
- [ ] Private conversations are only visible to the creator
- [ ] Org-visible conversations are readable by all org members
- [ ] Non-creators cannot send turns in org-visible conversations
- [ ] Conversations list shows shared conversations from other org members
- [ ] Branch links work: `/conversations/:id/branch/:branchId`
- [ ] Read-only mode displays correctly for non-creators
- [ ] `ai_conversation.visibility_changed` event is emitted

## How to test

1. Create a private conversation — other org members cannot see it in their list
2. Toggle visibility to Org — confirm dialog appears, then conversation becomes visible to others
3. As another org member, open the shared conversation — turns are visible, input is hidden
4. Attempt to send a turn via GraphQL as a non-creator — should be rejected
5. Share a branch link — recipient opens it and sees the correct branch
6. Share a link to a private conversation — non-creator sees "Access denied"
