# AI Conversations Remediation Plan

## Scope

This plan treats the numbered files in `tickets/ai-conversations/` as the source of truth for the AI conversation branching feature. The `README.md` in this folder is currently unrelated ambient-AI spec text and is not used as the implementation checklist for this remediation.

The current branch contains later ticket commits, but the application state at `HEAD` is internally inconsistent. The fix strategy is to restore the last coherent AI-conversation implementation surfaces and then layer the later-ticket requirements back in without reintroducing the regressions.

## Delivery Order

### 1. Re-establish the canonical data model

- Align `apps/server/prisma/schema.prisma` with the already-added migrations and the ticket set.
- Ensure the Prisma schema declares:
  - `AiConversation.visibility`
  - `AiConversation.agentObservability`
  - `AiConversation.modelId`
  - `AiConversation.systemPrompt`
  - `AiConversation.forkedFromConversationId`
  - `AiConversation.forkedFromBranchId`
  - `AiConversation.linkedEntities`
  - `AiTurn.summarized`
  - `AiBranchSummary`
  - AI conversation event enum values for visibility, summaries, observability, and linking
- Keep ticket 19 fork provenance fields while preserving ticket 20 summary fields and ticket 22 linking fields.

### 2. Restore backend contract parity

- Bring `AiConversationService` back into parity with tickets 02, 09, 10, 18, 19, 20, 21, and 22.
- Required service surface:
  - `createConversation`
  - `getConversation`
  - `getConversations`
  - `getBranch`
  - `getBranches`
  - `getBranchDepth`
  - `getBranchAncestors`
  - `updateTitle`
  - `updateConversation`
  - `updateVisibility`
  - `updateAgentObservability`
  - `labelBranch`
  - `forkBranch`
  - `forkAiConversation`
  - `linkEntity`
  - `unlinkEntity`
- Ensure `forkBranch` follows ticket 10 zero-copy ancestry semantics.
- Ensure `forkAiConversation` follows ticket 19 deep-copy semantics into a new private conversation.
- Ensure emitted event names match the GraphQL/Prisma event registries.

### 3. Restore GraphQL surface parity

- Align `packages/gql/src/schema.graphql` and `apps/server/src/schema/ai-conversation.ts` with the ticket set.
- Required queries:
  - `aiConversations`
  - `aiConversation`
  - `branch`
  - `branchAncestors`
  - `branchSummary`
  - `contextHealth`
- Required mutations:
  - `createAiConversation`
  - `sendTurn`
  - `updateAiConversationTitle`
  - `updateAiConversation`
  - `updateAiConversationVisibility`
  - `updateAgentObservability` or equivalent resolver/schema pair with one consistent name
  - `labelBranch`
  - `forkBranch`
  - `summarizeBranch`
  - `linkConversationEntity`
  - `unlinkConversationEntity`
  - `forkAiConversation`
- Required type fields:
  - `AiConversation.agentObservability`
  - `AiConversation.modelId`
  - `AiConversation.systemPrompt`
  - `AiConversation.linkedEntities`
  - `AiConversation.forkedFromConversationId`
  - `AiConversation.forkedFromBranchId`
  - `Branch.latestSummary`
  - `Branch.contextHealth`
  - `Turn.summarized`

### 4. Restore frontend store and transport parity

- Reconcile the entity store with ticket 06 and ticket 20:
  - `AiConversationEntity` must carry observability, model/system prompt, linked entities, and fork provenance.
  - `AiBranchSummaryEntity` must exist again.
  - `AiTurnEntity` must carry `summarized`.
- Reconcile the AI conversation event processor so the same pipeline handles:
  - conversation create/title/visibility/config/observability
  - branch create/label
  - turn create
  - branch summary updates
  - entity link/unlink
  - fork provenance fields
- Restore query and mutation hooks expected by the current components.

### 5. Restore frontend selector and component parity

- Reconcile selectors with tickets 06, 12, 13, 16, 17, 18, 19, and 20.
- Required selectors/hooks:
  - `useMyConversationIds`
  - `useSharedConversationIds`
  - `useBranchSummary`
  - `useChildBranchIds`
  - `useHighlightTurnId`
  - `useBranchTreePanelOpen`
  - `useTreeNodeCollapsed`
  - `useContextHealthQuery`
  - `useUpdateAiConversation`
  - `useUpdateAgentObservability`
  - `useForkBranch`
  - `useLabelBranch`
  - `useLinkConversationEntity`
  - `useUnlinkConversationEntity`
  - `useForkAiConversation`
- Ensure `useBranchTimeline()` includes summary nodes again so ticket 20 is visible in the UI.
- Remove duplicate exports and duplicate object keys that break the web build.

### 6. Close plan-level behavior gaps

- Ticket 10: zero-copy branch inheritance must remain in `forkBranch`.
- Ticket 19: deep-copy forking into a new conversation must remain in `forkAiConversation`.
- Ticket 20: summary nodes and context health must be visible through the query/store/timeline pipeline.
- Ticket 21: observability setting changes must flow through the same event/store path.
- Ticket 22: link/unlink surfaces must be durable and visible in the conversation UI/state.

### 7. Verification

- Run targeted TypeScript checks for:
  - `apps/server`
  - `apps/web`
  - `packages/gql`
- If local dependencies allow, run any AI-conversation-related tests and codegen.
- Update the gap tracker until all items are marked resolved or explicitly documented as blocked by environment limitations.

## Ticket Coverage Map

| Ticket | Coverage in this remediation |
| --- | --- |
| 01-05 | Preserve foundations and event flow while repairing contract drift |
| 06 | Restore store/entity/query/subscription parity |
| 07-08 | Preserve sidebar and conversation view integration |
| 09 | Restore model/system prompt conversation config |
| 10 | Restore zero-copy branch forking and ancestor assembly |
| 11-17 | Preserve branch UI features that depend on the restored selectors/hooks |
| 18 | Restore visibility mutation/access-control/frontend split views |
| 19 | Preserve deep-copy fork-to-private-conversation behavior and provenance fields |
| 20 | Restore summaries, context health, and summary timeline nodes |
| 21 | Restore observability field, mutation, and event/store plumbing |
| 22 | Restore linked-entity plumbing and action-facing service surface |
