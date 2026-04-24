# Session Autopilot RFC

## Summary

Session Autopilot is a QA-first orchestration layer that can manage a coding session after the human has kicked it off. It does not replace the coding session. It supervises it.

The core idea is:

- The primary coding session keeps doing the implementation work.
- A second AI "controller" reviews progress at natural checkpoints.
- The controller either sends the next instruction to the worker session or asks a human to step in for QA, validation, or judgment.
- The entire feature runs through Trace's existing service layer, event stream, session runtime, and inbox model.

This document covers both:

- the full product experience
- the engineering design needed to build it in a way that fits Trace v2

---

## Product Thesis

Today, a coding session is mostly reactive. The user sends a prompt, the agent works, and the user manually decides what to do next.

Autopilot turns that into a managed loop:

- the human defines the goal once
- the worker session implements
- the controller session reviews the latest result
- the controller either continues the loop or escalates to a human when QA or judgment is needed

The product promise is not "fully autonomous coding."

The product promise is:

- fewer manual nudges
- better review discipline
- a strong bias toward human QA at the right time

Autopilot should feel like "I have a staff engineer managing this session," not "I turned on a runaway bot."

---

## Goals

- Let a user turn on Autopilot from the current session UI.
- Let the user choose which upper-layer AI runs Autopilot at runtime.
- Reuse the existing coding session stack so the upper-layer AI can be Claude Code or Codex.
- Give the controller enough context to make useful decisions:
  last user message, session transcript, latest checkpoint, latest commit diff, session status, PR status.
- Bias the controller toward QA and human validation over endless autonomous loops.
- Route all human handoff through the inbox.
- Preserve auditability through events and durable state.
- Keep GraphQL thin and keep business logic in the service layer.

---

## Non-Goals

- General-purpose workflow automation for all entities in Trace.
- Autonomous merge, deploy, or production rollout in v1.
- A generic no-code playbook engine in v1.
- Replacing the existing ambient agent pipeline.
- Direct model-initiated Trace API mutations from Codex or Claude Code in the smallest coherent v1. In v1, the controller emits a bounded decision and the server applies it through the service layer.
- Mobile parity in v1 if the mobile product still lacks a real inbox surface.

---

## Product Experience

## 1. Entry Point

Autopilot is surfaced from the active session UI.

Primary UI elements:

- an `Autopilot` button in the session header
- a compact status chip near the session status
- a settings popover or dialog opened from the button

States shown to the user:

- `Off`
- `Waiting`
- `Reviewing`
- `Continuing`
- `Needs Human`
- `Paused`
- `Error`

The button should communicate that Autopilot is supervising the session, not replacing it.

---

## 2. Enable Flow

When the user turns on Autopilot, they configure:

- controller tool: `claude_code` or `codex`
- controller model
- controller runtime, when local
- playbook template
- optional custom instructions

Recommended default playbook:

`implement -> review -> fix important issues -> request human QA`

Recommended default copy:

"Autopilot will wait while the session is running. When the session finishes a pass, it will review the latest output and either continue the work or ask for human validation."

---

## 3. Runtime Behavior

### When the worker session is active

Autopilot does nothing except show `Waiting`.

It should not interrupt an actively running session just because it is enabled.

### When the worker session completes a pass

Autopilot gathers context and wakes the controller.

The controller decides one of three outcomes:

- `continue_worker`
- `request_human_validation`
- `stop`

### When the worker session needs explicit input

The existing plan/question flow stays authoritative in v1.

If the worker session already asked a question or presented a plan:

- keep the current inbox behavior
- do not let Autopilot invent a competing action
- optionally add an Autopilot summary later, but not in v1

### When the session is moved or rehomed

Autopilot should follow the session lineage automatically. The user should not need to re-enable it just because the session moved to another runtime.

---

## 4. What the Controller Sees

The controller should receive a compact but high-signal packet, not the entire universe.

Minimum context:

- the latest user message
- the session transcript
- the latest git checkpoint metadata
- the latest commit diff
- current session status
- queued follow-up messages
- PR URL and review state, if present
- linked ticket ids and project ids, if present
- the active playbook and any custom instructions

The commit diff matters because it grounds the controller in what actually changed, instead of forcing it to infer quality from the assistant's prose.

---

## 5. Human Handoff

When the controller decides the work is ready for QA, blocked on judgment, or uncertain, it creates an inbox item.

The inbox handoff should contain:

- a short title
- a plain-language reason the human is needed
- a QA checklist
- links back to the session and active branch/PR
- the latest checkpoint sha
- the controller's concise recommendation

Example reasons:

- "Implementation looks complete. Please run QA on the auth flow before the next pass."
- "The code compiles, but behavior changed around session recovery. Human verification is needed."
- "The worker can continue, but there is a product tradeoff around destructive session deletion."

The inbox item should feel like a focused review request, not a generic alert.

---

## 6. Example Journey

1. User starts a coding session for a ticket.
2. User enables Autopilot with the QA-first playbook.
3. Worker session implements until it reaches a natural stop.
4. Worker emits a checkpoint commit and completes.
5. Autopilot wakes the controller.
6. Controller reviews the transcript plus commit diff.
7. Controller decides the worker missed two important edge cases.
8. Autopilot sends a focused follow-up message to the worker session.
9. Worker completes a second pass.
10. Controller reviews again.
11. Controller decides the code is ready for human validation.
12. User gets an inbox item with a QA checklist and opens the session directly from it.

This is the ideal loop:

- worker does implementation
- controller does supervision
- human does validation when it matters

---

## 7. Edge Cases

### No checkpoint yet

If there is no checkpoint commit, the controller falls back to:

- transcript
- latest branch diff summary
- recent assistant output

### Controller cannot parse the situation

Create an inbox item instead of guessing.

### Worker failed

Autopilot should not blindly continue. It should either:

- ask for human help
- or stop with an error state

### Worker already has a pending human request

Autopilot stays idle. One human handoff path at a time.

### Mobile

If mobile still lacks an inbox surface, v1 should be web and desktop first. Push notifications can come later.

---

## Recommended Technical Design

## 1. Scope: Session Group, Not Raw Session

Autopilot should be attached to the session group lineage, not to a single session id.

Reason:

- session ids can change on move-to-runtime and move-to-cloud flows
- the workspace, branch, and checkpoint history are group-scoped
- the user mental model is "manage this branch of work," not "manage this exact runtime process id"

Product surface:

- the button lives on the active session

Engineering ownership:

- the durable autopilot state belongs to the session group lineage

---

## 2. Controller Model: Hidden Controller Session

The upper-layer AI should be represented as another Trace session under the hood.

Recommended shape:

- keep the existing worker session as the user-visible implementation session
- create a hidden controller session that uses the normal coding tool adapters
- run the controller in read-only `ask` mode

Why this is the right fit:

- it satisfies the requirement that the upper-layer AI can be Claude Code or Codex
- it reuses the existing session router, runtime selection, tool adapters, model handling, and transcript persistence
- it avoids building a parallel "special autopilot runtime" stack

Why not use the ambient agent pipeline:

- the ambient agent currently uses the LLM adapter stack, not the coding tool adapter stack
- that means it is not actually "another Claude Code/Codex instance"

---

## 3. Architecture Overview

```text
User
  -> Session UI
    -> sessionAutopilotService.enable(...)
      -> create/update SessionAutopilot
      -> create/reuse hidden controller session

Worker session events
  -> event store
    -> sessionAutopilotOrchestrator
      -> build autopilot context
      -> send prompt to controller session
      -> parse controller decision
      -> either:
         - sessionService.sendMessage / run on worker
         - inboxService.createItem for human validation
         - update autopilot state to idle/stopped
```

Everything still goes through services and events.

No client or agent writes events directly.

---

## 4. Data Model

### New enum: `SessionRole`

```prisma
enum SessionRole {
  primary
  autopilot_controller
}
```

### New enum: `SessionAutopilotStatus`

```prisma
enum SessionAutopilotStatus {
  disabled
  waiting
  reviewing
  continuing
  needs_human
  paused
  error
}
```

### New enum: `AutopilotDecisionAction`

```prisma
enum AutopilotDecisionAction {
  continue_worker
  request_human_validation
  stop
}
```

### New model: `SessionAutopilot`

Recommended as a first-class entity instead of stuffing JSON onto `SessionGroup`.

```prisma
model SessionAutopilot {
  id                        String                    @id @default(uuid())
  organizationId            String
  organization              Organization              @relation(fields: [organizationId], references: [id])
  sessionGroupId            String                    @unique
  sessionGroup              SessionGroup              @relation(fields: [sessionGroupId], references: [id])
  ownerUserId               String
  ownerUser                 User                      @relation(fields: [ownerUserId], references: [id])
  status                    SessionAutopilotStatus    @default(disabled)
  enabled                   Boolean                   @default(false)
  controllerTool            CodingTool
  controllerModel           String?
  controllerHosting         HostingMode
  controllerRuntimeInstanceId String?
  controllerSessionId       String?
  activeSessionId           String?
  playbook                  String
  customInstructions        String?
  lastCheckpointSha         String?
  lastDecisionAction        AutopilotDecisionAction?
  lastDecisionSummary       String?
  lastEvaluatedAt           DateTime?
  lastHumanInboxItemId      String?
  consecutiveAutoTurns      Int                       @default(0)
  createdAt                 DateTime                  @default(now())
  updatedAt                 DateTime                  @updatedAt
}
```

### Session updates

Add `role SessionRole @default(primary)` to `Session`.

Controller sessions should be filtered out of:

- normal session tables
- session tab strips
- session group status derivation
- "my sessions" style views

---

## 5. GraphQL Contract

Recommended GraphQL additions:

```graphql
enum SessionRole {
  primary
  autopilot_controller
}

enum SessionAutopilotStatus {
  disabled
  waiting
  reviewing
  continuing
  needs_human
  paused
  error
}

type SessionAutopilot {
  id: ID!
  sessionGroupId: ID!
  ownerUser: User!
  status: SessionAutopilotStatus!
  enabled: Boolean!
  controllerTool: CodingTool!
  controllerModel: String
  controllerHosting: HostingMode!
  controllerRuntimeInstanceId: ID
  controllerSessionId: ID
  activeSessionId: ID
  playbook: String!
  customInstructions: String
  lastCheckpointSha: String
  lastDecisionSummary: String
  lastEvaluatedAt: DateTime
  consecutiveAutoTurns: Int!
}

input UpsertSessionAutopilotInput {
  sessionGroupId: ID!
  enabled: Boolean!
  controllerTool: CodingTool!
  controllerModel: String
  controllerHosting: HostingMode!
  controllerRuntimeInstanceId: ID
  playbook: String!
  customInstructions: String
}

type Mutation {
  upsertSessionAutopilot(input: UpsertSessionAutopilotInput!): SessionAutopilot!
  disableSessionAutopilot(sessionGroupId: ID!): SessionAutopilot!
  runSessionAutopilotNow(sessionGroupId: ID!): SessionAutopilot!
}
```

GraphQL resolvers remain thin wrappers around a new `sessionAutopilotService`.

---

## 6. Event Model

Recommended new event types:

```graphql
enum EventType {
  ...
  session_autopilot_created
  session_autopilot_updated
  session_autopilot_disabled
  session_autopilot_review_requested
  session_autopilot_decision_applied
  session_autopilot_handoff_requested
}
```

These events should carry enough payload to update the Zustand store directly without refetching.

Suggested payload shape:

```ts
{
  autopilot: { ...full SessionAutopilot snapshot ... },
  sessionGroup: { ...optional group snapshot ... },
  sessionId: "current target session id",
  decisionAction: "continue_worker" | "request_human_validation" | "stop",
}
```

---

## 7. Service Layer

### New service: `sessionAutopilotService`

Responsibilities:

- create/update/disable autopilot state
- create or reuse the hidden controller session
- resolve the active worker session in the group
- decide when an evaluation should run
- build the controller prompt/context packet
- parse the controller decision
- call `sessionService.run()` or `sessionService.sendMessage()` when continuing work
- call `inboxService.createItem()` when human validation is needed
- emit autopilot events

### New orchestrator: `sessionAutopilotOrchestrator`

Responsibilities:

- subscribe to session lifecycle events relevant to autopilot
- dedupe and serialize runs per session group
- keep autopilot evaluation off the request path

Recommended trigger sources:

- worker session completed
- worker session rehomed
- worker session checkpoint created
- manual `run now`

Do not trigger on every `session_output`.

The controller should wake at stable checkpoints, not on every token of activity.

---

## 8. Context Assembly

### Existing building blocks we can reuse

- `buildConversationContext(sessionId)` in `apps/server/src/services/session.ts`
- `GitCheckpoint` persistence already tied to session/group lineage
- `branchDiff()` already exists for group-level change summaries
- inbox item creation already exists
- runtime/tool/model selection already exists for sessions

### Missing building block

We do not currently have a first-class "show me the latest commit patch" service.

Recommended addition:

- add a bridge command like `commit_diff`
- server helper resolves the latest checkpoint sha
- bridge runs `git show --stat --patch --format=medium <sha>`
- response is size-limited before being sent to the controller prompt

### Context packet shape

```ts
type SessionAutopilotContext = {
  latestUserMessage: string | null;
  transcript: string;
  latestCheckpointSha: string | null;
  latestCheckpointSubject: string | null;
  latestCommitDiff: string | null;
  branchDiffSummary: Array<{ path: string; status: string; additions: number; deletions: number }>;
  sessionStatus: string;
  agentStatus: string;
  prUrl: string | null;
  queuedMessages: Array<{ text: string; interactionMode: string | null }>;
  ticketIds: string[];
  projectIds: string[];
  playbook: string;
  customInstructions: string | null;
};
```

---

## 9. Controller Prompt Contract

Because Claude Code and Codex do not give us the same structured tool-call contract as the ambient LLM pipeline, the controller should respond with strict XML in its first text block.

Recommended contract:

```xml
<autopilot-decision>
  <action>continue_worker</action>
  <summary>Two auth edge cases are still untested.</summary>
  <message-to-worker>Add tests for expired session recovery and retry after bridge reconnect.</message-to-worker>
  <qa-checklist></qa-checklist>
</autopilot-decision>
```

```xml
<autopilot-decision>
  <action>request_human_validation</action>
  <summary>The implementation looks complete but needs product QA on reconnection behavior.</summary>
  <message-to-worker></message-to-worker>
  <qa-checklist>
    <item>Start a session on a local bridge and disconnect the bridge mid-run.</item>
    <item>Verify the session can be retried or moved without duplicate messages.</item>
  </qa-checklist>
</autopilot-decision>
```

Parser rules:

- if parsing fails, create an inbox item instead of guessing
- if required fields are missing, treat it as a controller error
- log the raw controller output for debugging

---

## 10. Execution Rules

Recommended rules:

- if worker `agentStatus == active`, do nothing
- if worker `sessionStatus == needs_input`, do nothing in v1
- if worker completed and there is no newer checkpoint than the last reviewed one, do nothing
- if `consecutiveAutoTurns` exceeds a limit, require human validation
- if the last human inbox item was dismissed recently, pause Autopilot

Recommended hard guardrails:

- max consecutive auto turns: `3`
- do not continue twice from the same checkpoint sha
- do not continue if the controller summary is empty
- do not create multiple active human validation inbox items for the same group

---

## 11. Inbox Design

Recommended new inbox item type:

```graphql
enum InboxItemType {
  ...
  autopilot_validation_request
}
```

Payload should include:

- `sessionGroupId`
- `sessionId`
- `checkpointSha`
- `prUrl`
- `summary`
- `qaChecklist`
- `controllerTool`
- `controllerModel`

The web inbox renderer should get a dedicated `InboxAutopilotValidationBody` component.

Actions:

- `Open session`
- `Open PR` when present
- `Mark validated`
- `Send follow-up to session`
- `Pause Autopilot`

---

## 12. UI Design

### Web and desktop v1

Add to the session header:

- `Autopilot` button
- status chip

Autopilot popover contents:

- enabled toggle
- controller tool picker
- controller model picker
- controller hosting/runtime picker
- playbook select
- custom instructions textarea
- `Run now`
- `Pause`
- `Disable`

Optional secondary surface:

- a compact Autopilot timeline in session history showing last review, last action, last handoff

### Mobile

Not required for v1 unless the mobile app gains:

- an inbox screen
- session-level header actions for autopilot settings

Push notifications can be a later follow-up.

---

## 13. Playbooks

V1 should support prompt-driven named playbooks, not a workflow engine.

Recommended built-ins:

### `qa_first`

- wait for worker completion
- review transcript plus commit diff
- continue only if there are important issues
- otherwise request human validation

### `implement_review_fix`

- wait for worker completion
- review latest output
- continue with a focused fix pass if needed
- stop after the fix pass or escalate to human if uncertain

### `ticket_start_to_qa`

- start from linked ticket intent
- run implementation loop
- request human validation when code is ready

Tool-specific note:

- Claude Code can later integrate project/user skills more naturally
- Codex should use plain prompt instructions in v1

The playbook system should be easy to extend, but it should not become a generic state machine yet.

---

## 14. Rollout Plan

### Phase 0: Spec and contracts

- agree on product shape
- agree on data model
- agree on decision contract

### Phase 1: Backend skeleton

- add Prisma and GraphQL types
- add controller session role
- add autopilot service and state transitions
- add event types

### Phase 2: Context and diff plumbing

- add latest commit diff bridge command
- build controller context packets
- wake controller at worker completion

### Phase 3: Continue-worker path

- parse controller decision
- send follow-up messages back to worker
- add loop guards

### Phase 4: Human validation path

- add inbox item type and body
- add status chip and settings popover
- wire `Needs Human` state

### Phase 5: Polish and follow-ups

- playbook improvements
- mobile push/inbox follow-up
- analytics and success metrics

---

## 15. Testing Strategy

### Backend unit tests

- autopilot enable/update/disable
- controller session creation and reuse
- trigger conditions
- context builder output
- controller decision parsing
- loop guard behavior
- move/rehydration lineage handling

### Backend integration tests

- worker complete -> controller continue_worker
- worker complete -> controller request_human_validation
- repeated completion with same checkpoint -> no duplicate action
- dismissed validation inbox item -> autopilot pauses or cools down

### Frontend tests

- button and settings rendering
- status chip transitions
- inbox validation card rendering
- store updates from autopilot events

---

## 16. Risks

- Hidden controller sessions could leak into normal UI if filtering is incomplete.
- The XML decision contract is more brittle than the ambient agent's structured tool-call approach.
- Commit diffs can be large, so truncation rules must be explicit.
- Codex and Claude Code will not have identical capabilities around slash-command skills.
- If the controller is too eager, the system will feel noisy and over-automated.
- If the controller is too conservative, the feature will feel useless.

---

## 17. Open Questions

- Should the controller session be fully hidden, or visible in a debug-oriented "Autopilot" panel?
- Should `request_human_validation` pause Autopilot automatically until the human acts?
- Should a human be able to approve the controller's recommended follow-up before it is sent to the worker, or should Autopilot send it directly?
- Do we want to reuse `agent_escalation` for the inbox handoff, or introduce a dedicated `autopilot_validation_request` type?
- Do we want the first version to support only the default QA-first playbook and defer all other playbooks?

---

## 18. Recommended Decisions

If we want the cleanest v1 that still matches the product vision, I recommend:

- session-group scoped autopilot state
- hidden controller session implemented on top of the existing session stack
- a new first-class `SessionAutopilot` entity
- a new first-class inbox type for Autopilot validation requests
- web and desktop only for v1
- one built-in QA-first playbook in v1

That gives us a coherent product story and a service-layer-friendly engineering path without building a second orchestration system beside sessions.

---

## 19. Screen-Level Product Experience

This section describes the concrete UX at the surface level, not just the abstract flow.

### Session header

The session header gets:

- an `Autopilot` button
- a state chip
- a small dropdown caret or settings affordance

Suggested states and copy:

| State       | User-facing meaning                         | Suggested copy          |
| ----------- | ------------------------------------------- | ----------------------- |
| Off         | Autopilot is disabled                       | `Autopilot Off`         |
| Waiting     | Worker is still running                     | `Autopilot Waiting`     |
| Reviewing   | Controller is reviewing the last pass       | `Autopilot Reviewing`   |
| Continuing  | Controller decided to continue the worker   | `Autopilot Continuing`  |
| Needs Human | Controller requested validation or judgment | `Autopilot Needs Human` |
| Paused      | Human explicitly paused it                  | `Autopilot Paused`      |
| Error       | Autopilot could not complete a review pass  | `Autopilot Error`       |

### Autopilot settings popover

Recommended sections inside the popover:

- `Mode`
- `Controller`
- `Playbook`
- `Behavior`
- `Actions`

Suggested fields:

- enabled toggle
- controller tool picker
- controller model picker
- controller hosting picker
- controller runtime picker
- playbook selector
- optional custom instructions textarea
- "Pause after human handoff" toggle
- "Run now" button
- "Disable" button

### Session timeline integration

Autopilot should also leave a trace in the session history so the user can understand why the system acted.

Recommended timeline entries:

- `Autopilot enabled`
- `Autopilot reviewed checkpoint abc1234`
- `Autopilot continued worker`
- `Autopilot requested human validation`
- `Autopilot paused`

These entries can be rendered from events rather than a separate log table in v1.

### Inbox card design

The Autopilot validation inbox item should show:

- a short title
- one sentence of summary
- a bulleted QA checklist
- `Open session`
- `Open PR`
- `Pause Autopilot`

The card should avoid implementation jargon. It should read like a review request from a teammate.

---

## 20. Session Autopilot State Machine

This is the most important engineering constraint in the design. If the state machine is fuzzy, the feature will be noisy and unreliable.

### High-level state machine

```text
disabled
  -> waiting            when enabled

waiting
  -> reviewing          when target worker completes and a new checkpoint exists
  -> paused             when human pauses
  -> disabled           when user disables

reviewing
  -> continuing         when controller decides continue_worker
  -> needs_human        when controller decides request_human_validation
  -> waiting            when controller decides stop
  -> error              on controller failure

continuing
  -> waiting            after follow-up message is sent to worker
  -> error              if the worker follow-up could not be sent

needs_human
  -> paused             if configured to pause after handoff
  -> waiting            after human resolves the inbox item and Autopilot remains enabled
  -> disabled           if user disables

paused
  -> waiting            when resumed
  -> disabled           when disabled

error
  -> waiting            when user retries or a later manual run succeeds
  -> disabled           when disabled
```

### Trigger rules

Autopilot should evaluate only when all of these are true:

- Autopilot is enabled
- Autopilot is not already reviewing
- there is a resolved active worker session in the group
- the worker is not `active`
- the worker is not `needs_input`
- the latest checkpoint sha differs from `lastCheckpointSha`

That keeps the system checkpoint-driven instead of chatter-driven.

---

## 21. File-Level Implementation Map

This is the concrete file map for the recommended implementation.

### Prisma and migrations

- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/...`

Add:

- `SessionRole`
- `SessionAutopilotStatus`
- `AutopilotDecisionAction`
- `SessionAutopilot`
- `Session.role`

Potential inbox enum addition:

- `autopilot_validation_request`

### GraphQL schema and codegen

- `packages/gql/src/schema.graphql`
- `packages/gql/src/generated/...`

Add:

- new enums
- `SessionAutopilot` type
- `sessionAutopilot(sessionGroupId: ID!)` query if needed
- `upsertSessionAutopilot`, `disableSessionAutopilot`, `runSessionAutopilotNow`
- new `EventType` values
- new `InboxItemType` value if using a dedicated validation card

### Server services

- `apps/server/src/services/session.ts`
- `apps/server/src/services/inbox.ts`
- `apps/server/src/services/session-autopilot.ts` new
- `apps/server/src/services/session-autopilot.test.ts` new

Likely hooks in `session.ts`:

- after worker completion
- after worker rehome or move
- after checkpoint persistence

The hook should stay thin and delegate to `sessionAutopilotService`.

### Orchestrator / background processing

- `apps/server/src/session-autopilot-worker.ts` new, or similar
- `apps/server/src/index.ts`

Responsibilities:

- subscribe to relevant events
- serialize runs by `sessionGroupId`
- call `sessionAutopilotService.reviewIfNeeded(...)`

### Session runtime and bridge plumbing

- `packages/shared/src/bridge.ts`
- `apps/server/src/lib/session-router.ts`
- `apps/container-bridge/src/bridge.ts`
- `apps/desktop/src/bridge.ts`

Add:

- `commit_diff` command
- `commit_diff_result` response
- `sessionRouter.commitDiff(...)`

Post-v1 extension when Codex or Claude Code should be able to invoke bounded Trace actions directly:

- inject `TRACE_API_URL` plus a short-lived `TRACE_RUNTIME_TOKEN` into the coding-tool process env
- let local and cloud launch paths pass per-run env into Codex / Claude Code
- bundle a `trace-agent` wrapper/CLI on `PATH` so the model can call Trace without hand-rolling auth headers
- keep the wrapper pointed at service-backed APIs only; no direct event creation and no raw DB writes
- scope runtime tokens to org, session or session group, and allowed actions, with short expiry and rotation per run when practical

### Web UI

- `apps/web/src/components/session/SessionHeader.tsx`
- `apps/web/src/components/session/SessionDetailView.tsx`
- `apps/web/src/components/session/SessionAutopilotPopover.tsx` new
- `apps/web/src/components/session/SessionAutopilotStatusChip.tsx` new
- `apps/web/src/components/inbox/InboxItemRow.tsx`
- `apps/web/src/components/inbox/InboxAutopilotValidationBody.tsx` new

### Client store and event handling

- `packages/client-core/src/stores/entity.ts`
- `packages/client-core/src/events/handlers.ts`
- `packages/client-core/src/events/ui-bindings.ts`

Add:

- `sessionAutopilots` table if Autopilot is a first-class entity in the client store
- handlers for new Autopilot event types
- inbox handling for the new validation item type

### Mobile

Not required for v1, but likely future touchpoints:

- `apps/mobile/src/components/sessions/SessionPageHeader.tsx`
- `apps/mobile/src/components/sessions/SessionActionsMenu.tsx`
- future inbox surface

---

## 22. Migration and Compatibility Plan

The schema change should be safe to roll out in stages.

### Database rollout

1. Add new enums and tables with no runtime usage.
2. Deploy backend code that can read null Autopilot state.
3. Deploy frontend that gracefully handles "no Autopilot configured".
4. Enable mutations and UI once both backend and frontend are live.

### Backward compatibility

- Existing sessions remain `role = primary`.
- Existing session groups have no Autopilot entity until explicitly enabled.
- Existing inbox items are unchanged.

### Failure tolerance

If Autopilot code is deployed but the controller session cannot be created:

- set Autopilot status to `error`
- emit an Autopilot error event
- do not interfere with the worker session

---

## 23. Permissions and Security

Autopilot should respect the same access model as normal sessions.

### Who can enable it

Recommended v1 rule:

- the session creator
- org admins

### Runtime access

The controller session should use the same runtime access checks as any normal session.

For local runtimes:

- do not silently bind to an inaccessible bridge
- fail into `error` or `paused`
- expose the reason in the UI

If a future runtime action wrapper is added:

- use short-lived runtime tokens, not long-lived user API keys
- inject those tokens into the tool process env at launch so child wrapper processes inherit them
- keep claims narrowly scoped to the intended org and action set
- fail closed on token expiry, org mismatch, or scope mismatch

### Repo safety

The controller should run in read-only `ask` mode by default.

The worker remains the only session writing code in v1.

That keeps the product model clear:

- one session implements
- one session supervises

### Data leakage

Autopilot context assembly must stay within org boundaries and should only include data the user already has access to.

That means:

- no cross-org lookups
- no bypass of runtime access
- no direct DB writes from the controller

---

## 24. Performance and Token Budgeting

Autopilot reviews can get expensive if the diff or transcript gets large, so the context builder needs explicit truncation rules.

Recommended limits:

- last user message: always included in full
- transcript: recent full transcript plus older summary if needed
- latest commit diff: hard cap by characters or lines
- branch diff summary: top changed files first
- queued messages: include all, since the list is small

Recommended fallback order when truncating:

1. keep latest user message
2. keep controller playbook and custom instructions
3. keep latest checkpoint metadata
4. keep recent transcript
5. keep a truncated commit diff
6. drop older transcript before dropping the latest diff summary

If the commit diff is too large:

- send a summarized diff header
- include top hunks from the most changed files
- include the file summary table

The controller does not need a perfect patch view every time. It needs enough signal to make a useful supervisory decision.

---

## 25. Telemetry and Success Metrics

This feature should ship with metrics from day one so we can tell whether it is helping or just creating noise.

Recommended counters:

- Autopilot enabled count
- Autopilot disabled count
- review runs started
- review runs succeeded
- review runs failed
- `continue_worker` decisions
- `request_human_validation` decisions
- `stop` decisions
- human validation inbox items created
- human validation inbox items accepted/resolved
- human validation inbox items dismissed
- average consecutive auto turns per group

Recommended product-level success signals:

- fewer manual follow-up nudges per session
- faster time from implementation to QA handoff
- fewer "done but not really done" sessions
- high resolution rate on validation inbox items

Recommended warning signals:

- high dismiss rate on validation handoffs
- high controller parse failure rate
- high error rate on controller session creation
- many repeated auto-turn loops before human involvement

---

## 26. Future Extensions

These are intentionally not v1, but the design should not block them.

### Additional playbooks

- security review first
- test stabilization loop
- review-and-land

### Team-wide templates

Let an org define default Autopilot playbooks or instructions by channel or project.

### Runtime action wrapper

Allow external coding tools like Codex and Claude Code to trigger a bounded set of Trace actions through a bundled wrapper/CLI.

Recommended shape:

- `trace-agent` binary or script available on `PATH` for desktop and cloud runtimes
- wrapper reads `TRACE_API_URL` and a short-lived `TRACE_RUNTIME_TOKEN` from env
- wrapper calls a narrow service-backed API surface for actions like follow-up messaging or inbox creation
- server verifies scoped runtime-token claims before dispatching to the normal service layer
- this stays additive to the v1 controller loop rather than replacing the XML decision contract

### Debug panel

Expose the hidden controller session and raw decisions in an Autopilot debug panel for power users.

Because the controller is implemented as a normal coding-tool session, this panel should prefer explicit service lookups plus reused session transcript/log components over inventing a second "Autopilot log" storage model.

Product guardrail:

- inspect the controller through an Autopilot-specific panel or drill-down
- do not leak hidden controller sessions into normal session lists, tabs, or default navigation

### Mobile support

- inbox surface
- push notifications for human validation requests
- lightweight Autopilot status controls

### Richer decision contracts

If Claude Code or Codex later supports a more reliable structured-response mode, replace the XML parser with a stronger contract.

---

## 27. Suggested Build Order

If the next step is implementation, this is the order I would actually build it in:

1. Prisma enums and `SessionAutopilot` model.
2. `Session.role` support and controller-session filtering.
3. GraphQL schema and generated types.
4. `sessionAutopilotService` CRUD and state transitions.
5. Worker trigger integration from `session.ts`.
6. Bridge `commit_diff` support and `sessionRouter.commitDiff()`.
7. Controller context builder and XML decision parser.
8. Continue-worker execution path.
9. Inbox validation handoff path.
10. Web header/status/popover UI.
11. Web inbox validation card.
12. Tests, telemetry, and polish.

That sequence keeps the product functional at each step and reduces the risk of wiring the UI before the service contracts are stable.

---

## 28. Example GraphQL Operations

These examples are not final API contracts, but they are close enough to guide implementation.

### Enable or update Autopilot

```graphql
mutation UpsertSessionAutopilot($input: UpsertSessionAutopilotInput!) {
  upsertSessionAutopilot(input: $input) {
    id
    sessionGroupId
    enabled
    status
    controllerTool
    controllerModel
    controllerHosting
    controllerRuntimeInstanceId
    controllerSessionId
    activeSessionId
    playbook
    customInstructions
    lastCheckpointSha
    lastDecisionSummary
    lastEvaluatedAt
    consecutiveAutoTurns
  }
}
```

Example variables:

```json
{
  "input": {
    "sessionGroupId": "sg_123",
    "enabled": true,
    "controllerTool": "claude_code",
    "controllerModel": "claude-sonnet-4-6",
    "controllerHosting": "local",
    "controllerRuntimeInstanceId": "bridge_abc",
    "playbook": "qa_first",
    "customInstructions": "Prioritize QA readiness over code churn."
  }
}
```

### Run Autopilot immediately

```graphql
mutation RunSessionAutopilotNow($sessionGroupId: ID!) {
  runSessionAutopilotNow(sessionGroupId: $sessionGroupId) {
    id
    status
    activeSessionId
    lastEvaluatedAt
  }
}
```

### Disable Autopilot

```graphql
mutation DisableSessionAutopilot($sessionGroupId: ID!) {
  disableSessionAutopilot(sessionGroupId: $sessionGroupId) {
    id
    enabled
    status
  }
}
```

---

## 29. Example Event Payloads

These examples matter because the client store should update from events without refetching.

### `session_autopilot_updated`

```json
{
  "autopilot": {
    "id": "sap_123",
    "sessionGroupId": "sg_123",
    "enabled": true,
    "status": "waiting",
    "controllerTool": "claude_code",
    "controllerModel": "claude-sonnet-4-6",
    "controllerHosting": "local",
    "controllerRuntimeInstanceId": "bridge_abc",
    "controllerSessionId": "sess_controller_1",
    "activeSessionId": "sess_worker_9",
    "playbook": "qa_first",
    "customInstructions": "Prioritize QA readiness over code churn.",
    "lastCheckpointSha": "abc1234",
    "lastDecisionSummary": "Waiting for a new worker pass.",
    "lastEvaluatedAt": "2026-04-23T15:40:00.000Z",
    "consecutiveAutoTurns": 1,
    "createdAt": "2026-04-23T15:00:00.000Z",
    "updatedAt": "2026-04-23T15:40:00.000Z"
  }
}
```

### `session_autopilot_decision_applied`

```json
{
  "autopilot": {
    "id": "sap_123",
    "sessionGroupId": "sg_123",
    "enabled": true,
    "status": "continuing",
    "controllerTool": "claude_code",
    "controllerModel": "claude-sonnet-4-6",
    "controllerHosting": "local",
    "controllerRuntimeInstanceId": "bridge_abc",
    "controllerSessionId": "sess_controller_1",
    "activeSessionId": "sess_worker_9",
    "playbook": "qa_first",
    "lastCheckpointSha": "abc1234",
    "lastDecisionSummary": "Continue with focused retry coverage and reconnection tests.",
    "lastEvaluatedAt": "2026-04-23T15:42:00.000Z",
    "consecutiveAutoTurns": 2,
    "createdAt": "2026-04-23T15:00:00.000Z",
    "updatedAt": "2026-04-23T15:42:00.000Z"
  },
  "sessionId": "sess_worker_9",
  "decisionAction": "continue_worker",
  "workerMessage": "Add tests for retry behavior after bridge reconnection and verify no duplicate queued-message drain."
}
```

### `session_autopilot_handoff_requested`

```json
{
  "autopilot": {
    "id": "sap_123",
    "sessionGroupId": "sg_123",
    "enabled": true,
    "status": "needs_human",
    "controllerTool": "claude_code",
    "controllerModel": "claude-sonnet-4-6",
    "controllerHosting": "local",
    "controllerRuntimeInstanceId": "bridge_abc",
    "controllerSessionId": "sess_controller_1",
    "activeSessionId": "sess_worker_9",
    "playbook": "qa_first",
    "lastCheckpointSha": "def5678",
    "lastDecisionSummary": "Implementation appears complete and needs human QA on reconnect edge cases.",
    "lastEvaluatedAt": "2026-04-23T15:49:00.000Z",
    "consecutiveAutoTurns": 2,
    "createdAt": "2026-04-23T15:00:00.000Z",
    "updatedAt": "2026-04-23T15:49:00.000Z"
  },
  "sessionId": "sess_worker_9",
  "decisionAction": "request_human_validation",
  "inboxItem": {
    "id": "inbox_456",
    "itemType": "autopilot_validation_request",
    "status": "active",
    "title": "Validate reconnect recovery flow",
    "summary": "The worker session looks complete but needs human QA on reconnection behavior.",
    "sourceType": "session_group",
    "sourceId": "sg_123"
  }
}
```

---

## 30. Controller Prompt Draft

This is a recommended starting prompt for the hidden controller session.

```text
You are the Autopilot controller for a Trace coding session.

Your job is not to implement code directly. Your job is to supervise the worker session.

You will receive:
- the latest user request
- the worker session transcript
- the latest checkpoint metadata
- the latest commit diff or branch diff summary
- session status and PR status
- the active playbook

You must decide exactly one of:
- continue_worker
- request_human_validation
- stop

Decision policy:
- Prefer human validation once the work appears ready for QA.
- Continue the worker only when there are clear, concrete, important follow-up tasks.
- Stop rather than inventing work.
- Do not ask for more implementation churn when the remaining uncertainty is fundamentally a human QA or product judgment problem.
- Treat correctness, validation, and risk reduction as more important than maximizing autonomous iteration count.

Output rules:
- Respond with a single XML block in your first text response.
- Use this schema exactly:

<autopilot-decision>
  <action>continue_worker|request_human_validation|stop</action>
  <summary>short explanation</summary>
  <message-to-worker>message or empty</message-to-worker>
  <qa-checklist>
    <item>optional</item>
  </qa-checklist>
</autopilot-decision>

If action is continue_worker:
- message-to-worker must contain a concrete next instruction.

If action is request_human_validation:
- qa-checklist should contain focused validation steps.

If action is stop:
- leave message-to-worker empty and qa-checklist empty.
```

### Notes on controller prompt strategy

- Keep the controller prompt stable so Autopilot behavior is predictable.
- Put playbook differences into a structured playbook block, not a rewritten full prompt per playbook.
- Prefer server-built context over letting the controller rediscover context from scratch.

---

## 31. Example Worker Follow-Up Messages

These examples clarify the difference between a good controller action and a noisy one.

Good `continue_worker` examples:

- "Add regression tests for queued-message drain after session completion. Focus on the duplicate-send edge case."
- "The reconnect path still lacks coverage for the original home bridge being offline. Add a test and update the retry state copy if needed."
- "Review the latest checkpoint against the ticket goal. Fix only the important issues around runtime access validation and avoid unrelated refactors."

Bad `continue_worker` examples:

- "Keep going."
- "Make it better."
- "Check if anything else needs work."

Good `request_human_validation` summaries:

- "The code path looks complete, but human QA is needed on local bridge disconnect and move-to-cloud recovery."
- "Implementation is likely correct, but this changes deletion behavior and needs human validation before another autonomous pass."

---

## 32. Acceptance Criteria By Milestone

### Milestone A: Autopilot state and UI shell

- User can enable and disable Autopilot from the session header.
- Controller tool, model, hosting, and runtime can be selected.
- Status chip updates from events without a refetch.
- No hidden controller sessions leak into the visible session list.

### Milestone B: Review loop

- When the worker completes a pass, Autopilot reviews exactly once per new checkpoint.
- Controller decisions are parsed and persisted.
- `continue_worker` sends a follow-up message back to the worker session.
- Loop guards prevent duplicate or runaway actions.

### Milestone C: Human validation

- `request_human_validation` creates an inbox item with the right payload.
- Inbox item opens the relevant session or PR directly.
- Resolving or dismissing the inbox item updates Autopilot state correctly.

### Milestone D: Operational quality

- Telemetry is emitted for runs, decisions, and failures.
- Error states are visible and recoverable.
- Rehome or move flows preserve Autopilot lineage correctly.

---

## 33. Final Recommendation

If the goal is to build a version of Autopilot that feels intentional, useful, and aligned with Trace's architecture, the strongest version of the plan is:

- make Autopilot a first-class entity
- scope it to the session group lineage
- implement the controller as a hidden Claude Code or Codex session
- make the review loop checkpoint-driven
- bias the controller toward human QA
- ship web and desktop first

That gives product a coherent story and gives engineering a build path that reuses the existing session/event/service architecture instead of fighting it.
