# 04 — GraphQL Schema & Resolvers

## Summary

Add the GraphQL types, queries, mutations, and subscriptions for AI Conversations. Resolvers are thin wrappers around the service layer — no business logic in resolvers. The schema uses `AiConversation`, `Branch`, and `Turn` types to avoid any naming collisions with existing Channel/Message types.

## What needs to happen

- Add types to `packages/gql/src/schema.graphql`:
  ```graphql
  enum AiConversationVisibility { PRIVATE ORG }
  enum TurnRole { USER ASSISTANT }

  type AiConversation {
    id: ID!
    title: String
    visibility: AiConversationVisibility!
    createdBy: User!
    rootBranch: Branch!
    branches: [Branch!]!
    branchCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Branch {
    id: ID!
    conversation: AiConversation!
    label: String
    parentBranch: Branch
    forkTurn: Turn
    turns: [Turn!]!
    childBranches: [Branch!]!
    depth: Int!
    turnCount: Int!
    createdBy: User!
    createdAt: DateTime!
  }

  type Turn {
    id: ID!
    branch: Branch!
    role: TurnRole!
    content: String!
    parentTurn: Turn
    branchCount: Int!
    childBranches: [Branch!]!
    createdAt: DateTime!
  }
  ```
- Add input types:
  ```graphql
  input CreateAiConversationInput {
    title: String
    visibility: AiConversationVisibility
  }
  ```
- Add queries:
  ```graphql
  aiConversations(visibility: AiConversationVisibility): [AiConversation!]!
  aiConversation(id: ID!): AiConversation
  branch(id: ID!): Branch
  ```
- Add mutations:
  ```graphql
  createAiConversation(input: CreateAiConversationInput!): AiConversation!
  sendTurn(branchId: ID!, content: String!): Turn!
  updateAiConversationTitle(conversationId: ID!, title: String!): AiConversation!
  ```
- Add subscription:
  ```graphql
  branchTurns(branchId: ID!): Turn!
  conversationEvents(conversationId: ID!): Event!
  ```
- Create the GraphQL module under `apps/server/src/schema/` following the existing server pattern:
  - `aiConversation.ts` — query, mutation, and subscription resolvers
  - Each resolver calls the corresponding service method
  - Resolvers parse input, call service, format output — nothing else
- Register the module in `apps/server/src/schema/resolvers.ts`
- Keep later GraphQL additions for this feature in the same module family:
  - Branching tickets extend the schema with `forkBranch`
  - Conversation configuration tickets extend `AiConversation` with `modelId`, `systemPrompt`, `agentObservability`, and fork provenance
  - Context-management tickets extend the schema with summary and context-health fields
- Run `pnpm gql:codegen` to regenerate types
- Wire resolvers into the Apollo Server configuration

## Dependencies

- 03 (Turn Service & LLM Integration)
  <!-- Ticket 03 creates: sendTurn, getTurns, getTurn service methods + LLM integration -->

## Completion requirements

- [ ] All types, queries, mutations, and subscriptions are in `schema.graphql`
- [ ] `pnpm gql:codegen` runs without errors
- [ ] Resolvers exist and are wired into Apollo Server
- [ ] `createAiConversation` mutation works end-to-end (creates conversation + root branch)
- [ ] `sendTurn` mutation works end-to-end (creates user turn, calls LLM, returns assistant turn)
- [ ] `aiConversations` query returns conversations with correct access control
- [ ] `branchTurns` subscription emits new turns as they are created
- [ ] `conversationEvents` subscription emits conversation/branch metadata changes for the active viewport
- [ ] No business logic in resolvers — all logic lives in the service layer

## How to test

1. Run `pnpm gql:codegen` — no errors
2. Start the server, open Apollo Sandbox / GraphQL playground
3. Run `createAiConversation` mutation — verify response includes `id`, `rootBranch`
4. Run `sendTurn` mutation with the root branch ID — verify user and assistant turns are returned
5. Run `aiConversations` query — verify the created conversation appears
6. Subscribe to `branchTurns` and send a turn — verify the subscription emits the new turn
7. Subscribe to `conversationEvents`, update the title — verify the event arrives without polling
