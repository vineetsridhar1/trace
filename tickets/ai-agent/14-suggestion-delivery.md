# 14 — Suggestion Delivery via InboxItem

## Summary

When the policy engine routes a decision to `suggest`, the agent creates an InboxItem that the user can accept, edit, or dismiss. This reuses the existing inbox infrastructure. The suggestion carries the full proposed action so it can be executed on accept.

## What needs to happen

### Extend InboxItem types

- Add new `InboxItemType` enum values to the Prisma schema:
  - `ticket_suggestion`
  - `link_suggestion`
  - `session_suggestion`
  - `field_change_suggestion`
  - `comment_suggestion`
  - `message_suggestion`
  - `agent_suggestion` (generic fallback)
- Run migration

### Suggestion creation

- Create `apps/server/src/agent/suggestion.ts`
- When the policy engine returns `suggest`, create an InboxItem with:
  - `itemType`: mapped from action name (e.g. `ticket.create` → `ticket_suggestion`)
  - `title`: from `plannerOutput.userVisibleMessage` or auto-generated from the action
  - `summary`: from `plannerOutput.rationaleSummary`
  - `payload`: the full action (actionType, args), confidence, trigger event ID, agent ID, expiry timestamp
  - `userId`: the user to notify (determine from context — scope participants, ticket assignee, etc.)
  - `sourceType`: `"agent_suggestion"`
  - `sourceId`: trigger event ID
- Wire this into the agent pipeline: after the policy engine returns `suggest`, call the suggestion creator

### Suggestion accept flow

- Add a GraphQL mutation `acceptAgentSuggestion(inboxItemId: String!, edits: JSON)` that:
  1. Loads the InboxItem
  2. Extracts the stored action from payload
  3. Applies user edits if provided (user might change the ticket title before accepting)
  4. Executes the action through the executor (ticket 07)
  5. Resolves the InboxItem as `accepted`

### Inline suggestion rendering (optional for v1)

- For chat-scoped and channel-scoped suggestions, optionally render a lightweight inline card in the thread referencing the underlying InboxItem
- The inline card is a projection — the InboxItem is the source of truth for status (accepted/dismissed/expired)
- Accept/dismiss actions on the inline card should update the InboxItem, which then updates the inline card reactively via the event stream
- This is a nice-to-have for v1 — the inbox is the primary surface. Inline cards can be added after the core flow works

### Suggestion expiry

- Suggestions should have an `expiresAt` timestamp in their payload
- Defaults: ticket suggestions 72h, link suggestions 48h, session suggestions 24h
- A periodic background job checks for expired suggestions and resolves them as `expired`

## Dependencies

- 07 (Action Executor — executes accepted suggestions)
  <!-- Ticket 07 created: `ActionExecutor` class in `./agent/executor.js`. Constructor takes `ServiceContainer` (ticketService, chatService, sessionService, inboxService, summaryService?). Call `executor.execute(action, ctx)` where `action: PlannedAction { actionType: string, args: Record<string, unknown> }` and `ctx: AgentContext { organizationId, agentId, triggerEventId }`. Returns `ExecutionResult { status: "success" | "failed", actionType, result?, error? }`. The accept mutation should construct a PlannedAction from the stored InboxItem payload and an AgentContext from the org's agent identity + the original triggerEventId. -->
- 08 (Execution Logging — records suggestion outcomes)
- 12 (Policy Engine — triggers suggestion creation)
  <!-- Ticket 12 created: Import `evaluatePolicy`, `PolicyResult`, `PolicyActionResult`, `PolicyDecision`, `PolicyEngineInput` from `./agent/policy-engine.js`. Call `evaluatePolicy({ plannerOutput, context, isDm? })` — returns `PolicyResult` with `.actions` (array of `PolicyActionResult { action: ProposedAction, decision: "execute" | "suggest" | "drop", reason: string }`) and `.plannerOutput` (pass-through). For each action where `decision === "suggest"`, create an InboxItem. The `reason` string is loggable (e.g. "confidence_0.8_gte_suggest_0.5"). Also import `recordDismissal({ organizationId, scopeType, scopeId, actionType })` — call when a user dismisses a suggestion to activate the 24-hour cooldown. -->

## Completion requirements

- [x] New InboxItemType values exist via migration
- [x] Suggestions are created as InboxItems with the full action payload
- [x] `acceptAgentSuggestion` mutation exists and executes the stored action
- [x] User edits before accepting are applied to the action args
- [x] Suggestion expiry background job exists and resolves expired items
- [~] Suggestion outcomes (accepted/dismissed/expired) are recorded in the execution log — outcomes are recorded as events (`inbox_item_resolved` with resolution field), but not yet in the `AgentExecutionLog` table (deferred to ticket #15 pipeline integration)

<!-- Ticket 14 implemented:
  - `apps/server/src/agent/suggestion.ts` — `createSuggestion()` and `createSuggestions()`. Maps action names to InboxItemType via `ACTION_TO_ITEM_TYPE`. Payload shape: `SuggestionPayload { actionType, args, confidence, triggerEventId, agentId, rationaleSummary, expiresAt }`. Expiry defaults: ticket 72h, link/comment 48h, session/message 24h.
  - `apps/server/src/agent/suggestion-expiry.ts` — `startSuggestionExpiryWorker()` / `stopSuggestionExpiryWorker()`. Runs every 60s via setInterval.
  - `apps/server/src/services/inbox.ts` — added `acceptSuggestion()`, `dismissSuggestion()`, `expireSuggestions()`.
  - `apps/server/src/schema/inbox.ts` — `acceptAgentSuggestion` and `dismissAgentSuggestion` resolvers. Accept extracts PlannedAction from payload, merges user edits, and calls `executor.execute()`. Dismiss calls `recordDismissal()` for policy cooldown.
  - GraphQL: `acceptAgentSuggestion(inboxItemId: ID!, edits: JSON): InboxItem!` and `dismissAgentSuggestion(inboxItemId: ID!): InboxItem!`
  - Prisma enum: added `ticket_suggestion`, `link_suggestion`, `session_suggestion`, `field_change_suggestion`, `comment_suggestion`, `message_suggestion` to InboxItemType; added `expired` to InboxItemStatus.
  - Frontend: `InboxSuggestionBody.tsx` with accept/edit/dismiss flow, wired into `InboxItemRow.tsx`.
  - NOTE: Suggestion payload should include `scopeType` and `scopeId` for accurate dismissal cooldown (currently uses system scope as fallback).
  - NOTE: The accept resolver creates a new ActionExecutor per call — should use a shared singleton for idempotency.
-->

## How to test

1. Trigger a suggestion (mock a policy engine `suggest` decision) — verify an InboxItem appears for the correct user
2. Accept a ticket suggestion — verify a ticket is created with the suggested fields
3. Accept a ticket suggestion with edits (change the title) — verify the ticket uses the edited title
4. Dismiss a suggestion — verify the InboxItem status updates to `dismissed`
5. Create a suggestion with a 1-second expiry — verify the background job resolves it as `expired`
