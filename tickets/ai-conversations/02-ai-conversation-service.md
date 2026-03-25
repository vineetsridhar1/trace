# 02 — AI Conversation Service

## Summary

Create the service layer for managing AI conversations and branches. This service handles creation, querying, and updating of conversations and their branches. Following Trace conventions, the service layer owns all business logic — GraphQL resolvers will be thin wrappers around these methods.

## What needs to happen

- Create `apps/server/src/services/aiConversation.ts` with an `AiConversationService` class
- Implement `createConversation({ organizationId, createdById, title?, visibility? })`:
  - Creates the `AiConversation` record
  - Creates the root `AiBranch` (parentBranchId = null, forkTurnId = null)
  - Updates `AiConversation.rootBranchId` to point to the root branch
  - Returns the full conversation with root branch
- Implement `getConversation(id)`:
  - Returns conversation with branches and turn counts
  - Validates the requesting user has access (private = creator only, org = any org member)
- Implement `getConversations({ organizationId, userId, visibility?, limit? })`:
  - Returns conversations the user can see: their own private ones + org-visible ones
  - Sorted by `updatedAt` descending
  - Allow a bounded `limit` for list hydration if needed, but v1 does not require a GraphQL connection shape
- Implement `updateTitle(conversationId, title)`:
  - Updates the conversation title
  - Validates the requesting user is the creator
- Implement `getBranch(branchId)`:
  - Returns branch with its turns ordered by creation
- Implement `getBranches(conversationId)`:
  - Returns all branches for a conversation with metadata (turn count, depth, label)
- Implement `getBranchDepth(branchId)`:
  - Walk the parentBranch chain to compute depth (root = 0)
- Register the service in the service registry / DI container following the existing pattern

## Dependencies

- 01 (Database Schema)
  <!-- Ticket 01 creates: AiConversation, AiBranch, AiTurn Prisma models with all relations -->

## Completion requirements

- [ ] `AiConversationService` exists at `apps/server/src/services/aiConversation.ts`
- [ ] `createConversation` creates both the conversation and root branch atomically
- [ ] `getConversations` correctly filters by visibility and ownership
- [ ] `getConversation` enforces access control (private conversations only visible to creator)
- [ ] `getBranch` returns turns in correct order
- [ ] `getBranchDepth` correctly computes depth by walking the parent chain
- [ ] Service is registered and accessible from resolvers and agent runtime

## How to test

1. Call `createConversation` — verify both conversation and root branch are created
2. Call `getConversations` as the creator — should see the conversation
3. Call `getConversations` as a different org member — should NOT see a private conversation
4. Update visibility to `ORG` — now other org members should see it
5. Call `getBranch` on the root branch — should return empty turns list (no turns yet)
