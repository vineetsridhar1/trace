# 19 — Fork Others' Conversations

## Summary

Allow org members to fork a branch from a shared (org-visible) conversation, creating their own private copy as a new independent conversation. This is a full deep copy — the forked conversation has its own turns, is private to the forker, and does not affect the original. This enables collaborative exploration: someone shares an interesting conversation, others can fork it and take it in their own direction.

## What needs to happen

- Add `forkAiConversation` service method:
  - `forkAiConversation({ branchId, userId })`:
    - Validate the source conversation is org-visible (cannot fork private conversations you don't own)
    - Build the full context for the source branch using `buildContext(branchId)`
    - Create a new `AiConversation` owned by the forking user:
      - `visibility` = `PRIVATE`
      - `title` = original title + " (fork)" or similar
      - `createdById` = the forking user
    - Create a root branch in the new conversation
    - Copy all turns from the assembled context into the new root branch as a flat sequence
    - This is a full copy — the new conversation is completely independent
    - Emit `ai_conversation.created` event for the new conversation
    - Return the new conversation
- Add GraphQL mutation: `forkAiConversation(branchId: ID!): AiConversation!`
- Add "Fork to my conversations" button in the UI:
  - Appears in the conversation header when viewing an org-visible conversation you didn't create
  - Also appears on individual branches: "Fork this branch"
  - On click: creates the fork, navigates to the new conversation
  - Show a toast: "Forked conversation created"
- The forked conversation should indicate its origin:
  - Add `forkedFromConversationId` and `forkedFromBranchId` fields to the schema (optional, for reference)
  - Show "Forked from [original title]" in the conversation header (as a subtle note, not prominent)

## Dependencies

- 18 (Visibility & Sharing)
  <!-- Ticket 18 creates: visibility toggle, org-visible read-only access, access control -->

## Completion requirements

- [ ] `forkAiConversation` creates a new private conversation with all turns copied
- [ ] The new conversation is completely independent (changes don't affect the original)
- [ ] Only org-visible conversations can be forked by non-creators
- [ ] "Fork" button appears for non-creators viewing shared conversations
- [ ] Forking from a deep branch copies the full ancestor context (not just the branch's own turns)
- [ ] The fork indicates its origin (forkedFrom reference)
- [ ] Navigation to the new conversation works after forking

## How to test

1. User A creates a conversation, adds turns, sets visibility to Org
2. User B opens the shared conversation, clicks "Fork to my conversations"
3. A new private conversation is created for User B with all the turns
4. User B sends a new turn in the fork — it does not appear in User A's original
5. User A continues their conversation — it does not affect User B's fork
6. Fork from a deep branch (depth 3) — verify all ancestor turns are included in the flat copy
7. Attempt to fork a private conversation as a non-creator — should be rejected
