# AI Conversations Gap Tracker

## Status Legend

- `OPEN`: missing or broken at current branch `HEAD`
- `IN PROGRESS`: actively being repaired in this remediation
- `RESOLVED`: fixed in this remediation branch
- `BLOCKED`: cannot be fully verified in the current environment

## Current Gaps

| Area | Ticket(s) | Status | Gap |
| --- | --- | --- | --- |
| Source-of-truth docs | All | `RESOLVED` | Added [23-remediation-plan.md](/Users/vineet/trace/sessions/32a687d3-3999-4cf5-9272-10693e077969/kingfisher/tickets/ai-conversations/23-remediation-plan.md) and this tracker so the numbered AI-conversation tickets, not the unrelated `README.md`, are the maintained implementation checklist. |
| Prisma schema parity | 09, 19, 20, 21, 22 | `RESOLVED` | Restored AI conversation config fields, summary/linking models, fork provenance fields, and missing event enum values in [schema.prisma](/Users/vineet/trace/sessions/32a687d3-3999-4cf5-9272-10693e077969/kingfisher/apps/server/prisma/schema.prisma). |
| GraphQL resolver parity | 04, 09, 10, 18, 19, 20, 21, 22 | `RESOLVED` | Restored the missing AI conversation queries, mutations, and type resolvers in [ai-conversation.ts](/Users/vineet/trace/sessions/32a687d3-3999-4cf5-9272-10693e077969/kingfisher/apps/server/src/schema/ai-conversation.ts) and aligned the GraphQL schema in [schema.graphql](/Users/vineet/trace/sessions/32a687d3-3999-4cf5-9272-10693e077969/kingfisher/packages/gql/src/schema.graphql). |
| Service parity | 02, 09, 10, 18, 19, 20, 21, 22 | `RESOLVED` | Restored conversation config updates, zero-copy branch forking, deep-copy conversation forking, entity linking, branch ancestry helpers, and event publishing in [aiConversation.ts](/Users/vineet/trace/sessions/32a687d3-3999-4cf5-9272-10693e077969/kingfisher/apps/server/src/services/aiConversation.ts). |
| Branching semantics | 10 | `RESOLVED` | `forkBranch` is zero-copy again, `buildContext()` walks ancestor branches correctly, and `forkAiConversation` remains the separate deep-copy flow for ticket 19. |
| Context management | 20 | `RESOLVED` | Summary storage, budget-aware context assembly, summary timeline nodes, and context-health hydration are wired end to end across [aiBranchSummary.ts](/Users/vineet/trace/sessions/32a687d3-3999-4cf5-9272-10693e077969/kingfisher/apps/server/src/services/aiBranchSummary.ts), queries/selectors, and the timeline components. |
| Observability plumbing | 21 | `RESOLVED` | Conversation observability is now wired through schema, service, events, store updates, settings UI, and the agent worker drops `OFF` conversations before routing. |
| Linking plumbing | 22 | `RESOLVED` | Conversation link/unlink mutations, store updates, agent-driven ticket/session link suggestions, and durable ticket provenance links are implemented end to end. |
| Frontend hooks/selectors parity | 06, 09, 10, 18, 19, 20, 21, 22 | `RESOLVED` | Restored the missing hooks/selectors/mutations and the summary-aware timeline pipeline expected by the AI conversation UI. |
| Frontend barrel/build hygiene | 06+ | `RESOLVED` | Removed the duplicate `ConversationView` export, fixed the duplicate UI-store key, restored the richer entity-store API, and repaired the AI conversation rendering regressions. |
| Generated type parity | 04+ | `RESOLVED` | Regenerated the schema-derived GraphQL type and resolver outputs so the restored AI conversation schema surface is reflected in `packages/gql/src/generated`. |

## Exit Criteria

- Every row above is `RESOLVED` or explicitly `BLOCKED` with a concrete reason.
- The implementation surface matches the numbered AI conversation ticket docs rather than the unrelated README.
- TypeScript verification is rerun after the fixes and recorded below.

## Verification Log

- `pnpm --filter @trace/shared build` succeeded.
- `pnpm --filter @trace/gql exec tsc -b` succeeded after regenerating `packages/gql/src/generated/types.ts` and `packages/gql/src/generated/resolvers.ts`.
- `pnpm -C apps/web exec tsc --noEmit --pretty false` still fails, but the remaining errors are outside AI conversations and center on channel/session schema drift (`baseBranch`, `setupScript`, `slug`, `archivedAt`, and related event enums).
- `pnpm -C apps/server exec tsc --noEmit --pretty false` still fails, but the remaining errors are outside AI conversations and center on unrelated memory/channel/session/runtime drift.
- Filtered AI-conversation type checks are clean in both `apps/web` and `apps/server`; no remaining `aiConversation` / `aiTurn` / `aiBranchSummary` / observability / linking / summarization compile errors were reported after the remediation.
