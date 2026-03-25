# 01 — Database Schema

## Summary

Add Prisma models for the three core entities: `AiConversation`, `AiBranch`, and `AiTurn`. These are peer-level entities scoped to an organization, following the existing flat entity model. The schema uses `AiTurn` (not `Message`) and `AiBranch` (not `Thread`) to avoid collision with existing models.

## What needs to happen

- Add `AiConversation` model to `prisma/schema.prisma`:
  - `id` (UUID, default cuid)
  - `organizationId` (relation to Organization)
  - `createdById` (relation to User)
  - `title` (String, optional)
  - `visibility` (enum: `PRIVATE`, `ORG` — default `PRIVATE`)
  - `rootBranchId` (String, optional — set after root branch creation)
  - `createdAt`, `updatedAt` timestamps
  - Relations: `branches`, `createdBy`, `organization`
- Add `AiConversationVisibility` enum: `PRIVATE`, `ORG`
- Add `AiBranch` model:
  - `id` (UUID, default cuid)
  - `conversationId` (relation to AiConversation)
  - `parentBranchId` (self-relation, optional — null for root branch)
  - `forkTurnId` (relation to AiTurn, optional — null for root branch)
  - `label` (String, optional)
  - `createdById` (relation to User)
  - `createdAt` timestamp
  - Relations: `conversation`, `parentBranch`, `childBranches`, `forkTurn`, `turns`, `createdBy`
- Add `TurnRole` enum: `USER`, `ASSISTANT`
- Add `AiTurn` model:
  - `id` (UUID, default cuid)
  - `branchId` (relation to AiBranch)
  - `role` (TurnRole enum)
  - `content` (String — text, not limited length)
  - `parentTurnId` (self-relation, optional — null for first turn in branch)
  - `createdAt` timestamp
  - Relations: `branch`, `parentTurn`, `childTurn`, `forkedBranches`
- Add relation from `Organization` to `AiConversation` (one-to-many)
- Add relation from `User` to `AiConversation` (one-to-many)
- Create and run the Prisma migration
- Regenerate Prisma client (`pnpm db:generate`)

## Dependencies

None — this is the foundation for AI Conversations.

## Completion requirements

- [ ] `AiConversation`, `AiBranch`, and `AiTurn` models exist in `schema.prisma`
- [ ] `AiConversationVisibility` and `TurnRole` enums exist
- [ ] Self-relations work for `AiBranch.parentBranch` → `AiBranch.childBranches` and `AiTurn.parentTurn` → `AiTurn.childTurn`
- [ ] `AiTurn.forkedBranches` relation returns all branches that fork from that turn
- [ ] Migration runs successfully against a clean database
- [ ] Prisma client generates without errors
- [ ] Existing models and migrations are unaffected

## How to test

1. Run `pnpm db:migrate` — migration should apply cleanly
2. Run `pnpm db:generate` — Prisma client should regenerate
3. Open Prisma Studio (`npx prisma studio`) and verify the three new tables exist with correct columns
4. Run the existing test suite to confirm no regressions
