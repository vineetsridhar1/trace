# Project Autopilot Plan

## Summary

Project Autopilot turns a loose user goal into a project plan, durable tickets, and then a playbook-driven implementation loop. It is explicitly not the ambient agent. Every AI episode is a normal Trace session started for a concrete purpose through the same service layer used by users.

The product ships in two major phases:

- **Deliverable 0: Planning to tickets.** A cursor-like planning workspace interviews the user, iterates on the plan, saves the confirmed plan through the project planning service, asks AI for structured ticket drafts, lets the service validate and create durable tickets, and shows the ticket list in the project.
- **Orchestration phase.** A separate orchestrator starts one ticket at a time. On lifecycle events such as implementation completion, review completion, PR creation, merge, or inbox feedback, Trace starts a normal coding-tool session with the project context, lifecycle event, history, diff/session data, and playbook. Claude Code can be the initial adapter, but the core plan must not depend on Claude-specific behavior.

## Non-Negotiable Decisions

- Do not use the ambient agent for project planning or orchestration.
- Planning chat happens in a normal project-linked session.
- Ticket generation happens only after the user confirms the plan.
- Tickets are durable DB records created through services/CLI, not markdown-only artifacts.
- Orchestration is episodic. Each lifecycle event starts a fresh orchestrator session with a context packet and playbook.
- The orchestrator can send messages, create inbox items, start sessions, request reviews, and later create/merge PRs through explicit service/CLI actions.
- Start with sequential ticket execution. Parallel scheduling is out of scope until the sequential loop is excellent.
- The service layer owns plan approval, ticket creation, execution state transitions, lifecycle events, and orchestrator episode creation. GraphQL, CLI commands, and agent tools are thin callers.
- Event payloads must contain enough data to update the client entity store directly. Clients must not depend on mutation return values, urql cache state, or refetches to see the approved plan, generated tickets, execution state, or orchestrator decisions.
- Automation must be idempotent. Replaying a lifecycle event, retrying ticket generation, or refreshing the UI must not create duplicate tickets, duplicate executions, duplicate orchestrator episodes, or inconsistent run state.
- Core orchestration must stay adapter-neutral across `SessionAdapter`, `CodingToolAdapter`, and `LLMAdapter`. Vendor-specific defaults belong in adapter configuration, not project orchestration business logic.

## Architecture Guardrails

Project Autopilot should be implemented as a service-owned workflow on top of Trace's existing flat, event-first model.

### Domain Shape

- `ProjectRun` remains the top-level unit of planning and execution for a project.
- The approved plan can live on `ProjectRun` for D0, but the domain language should treat it as approved plan content, not as transient assistant output. If plan versioning becomes necessary, add a peer model such as `ProjectPlanVersion` instead of overwriting history.
- Generated tickets are normal `Ticket` rows linked to the project through the existing project-ticket relationship. Do not create a separate planned-ticket entity for D0.
- Ticket execution needs a durable peer record such as `ProjectTicketExecution` or equivalent fields with `organizationId`, `projectRunId`, `ticketId`, `sequence`, `status`, active session links, and timestamps. Execution state should not be inferred only from ticket status or session status.
- Playbooks need a durable model or configuration surface with versioning. A project run should resolve an effective playbook and snapshot the version used for each orchestrator episode so episodes are replayable.
- Orchestrator episodes need durable records keyed by the triggering lifecycle event. Store status, session id, playbook version, context packet hash or snapshot, action results, retry metadata, and a short decision summary.

### Events And State

- Every mutating service method must update durable state and append the corresponding event in the same transaction when possible.
- Project-run lifecycle events should be scoped to the project and include `projectRunId`, `ticketId` when relevant, execution id, previous and next status, linked session ids, and the full entity payloads needed by Zustand handlers.
- Ticket creation and ticket update events must include the full ticket payload, including project links, labels, status, priority, assignees, and timestamps. The project ticket list should appear from event hydration, not a mutation response.
- Lifecycle events wake the orchestrator through a dedicated consumer or service path. They must not route through the ambient agent.
- Use unique constraints or processed-event records for exactly-once effects on top of at-least-once event delivery, especially for ticket generation, execution startup, orchestrator episode creation, and PR/merge actions.

### Scalability

- Sequential execution is per project run, not global. Many organizations and project runs must be able to progress independently.
- Enforce one active ticket execution per project run in the database or in a transactionally acquired lock. UI checks alone are not sufficient.
- Context packets must be bounded and deterministic. Use summaries, event cursors, message limits, and explicit diff/checkpoint selection instead of dumping all project history or all session output.
- Lists must be designed for pagination and virtualization. D0 can be compact, but project tickets, execution history, orchestrator decisions, and events should not require loading every related row through an unbounded project detail query.
- Orchestrator retries need visibility, backoff, and a manual retry path. Failed automation should move the run to a recoverable state instead of silently stalling.
- PR creation and merging must be explicit, permissioned, configurable, and disableable per organization/project/run.

## Deliverable 0: Planning To Tickets

D0 is the first shippable product slice. It includes everything from first prompt through visible project tickets.

### User Flow

1. The user types an initial project prompt.
2. Trace creates a project, project run, and normal project-linked planning session.
3. The user sees a split planning workspace:
   - plan on the left
   - chat/interview on the right
4. The AI interviews the user and updates the plan through normal session turns.
5. The user clicks **Next** when the plan is acceptable.
6. Trace approves and saves the plan through the project planning service.
7. Trace asks AI for structured ticket drafts from the approved plan.
8. A service validates the drafts and creates tickets as durable DB rows linked to the project.
9. The user lands on or remains in the project ticket list.

### D0 Success Criteria

- A user can create a project from one prompt.
- The planning session is a normal session, not ambient.
- The split view supports iterative chat and plan review.
- Confirming the plan persists it to `ProjectRun`.
- Ticket generation creates real tickets in the DB.
- Ticket generation is service-owned, idempotent, and retryable.
- Generated ticket events hydrate full ticket entities and project links in Zustand.
- Opening a project shows its ticket list.
- The flow can be refreshed without losing the project, plan, session link, or tickets.

### D0 Architecture

```text
Project prompt
  -> projectService / projectRunService
  -> normal project-linked planning session
  -> split planning UI
  -> user confirms plan
  -> projectPlanningService saves approved plan
  -> ticket-generation service asks AI for structured drafts
  -> ticketService creates linked tickets in a validated batch
  -> project ticket list
```

GraphQL remains a thin client API. The CLI and session runtime must call service-backed commands. No client, CLI, or agent writes events or database rows directly. The web app must not parse markdown into tickets or use mutation results as the source of truth for ticket list state.

## Orchestration Phase

After D0, Project Autopilot becomes a playbook-driven loop over tickets.

### Sequential Ticket Loop

The first orchestrator version is intentionally simple:

1. Orchestrator episode v1 starts for a project run.
2. It sees all tickets and starts ticket 1.
3. It goes to sleep.
4. Ticket 1 emits a lifecycle event, such as implementation session completed.
5. Trace starts orchestrator episode v2 as a new normal coding-tool session.
6. The new episode receives:
   - lifecycle event
   - project and ticket state
   - playbook
   - relevant history
   - session messages
   - branch/checkpoint/diff context when available
   - prior orchestrator decisions
7. The episode decides the next action from the playbook.
8. The loop continues until all tickets are done or a human gate blocks progress.

### Playbooks

A playbook is a durable guideline for how orchestration should proceed. It is not hardcoded business logic and it is not a substitute for service-level state validation. It tells the orchestrator how to behave for a project or organization, while services enforce permissions, allowed transitions, and idempotency.

The default playbook should be close to:

- implement the ticket
- review against the plan
- fix all review issues
- if anything needs human QA, put it in the user's inbox
- if the user gives suggestions, implement them
- rereview
- put QA back in the inbox when needed
- create a PR
- merge when the configured conditions are satisfied

The user will provide the exact context template later. The plan must leave room for that template without assuming the final shape.

### Orchestrator Episodes

An orchestrator episode is a normal coding-tool session created for one lifecycle event. It is not a daemon and not the ambient agent.

Each episode should:

- receive a bounded context packet
- read the playbook
- inspect current project/ticket/session state
- decide one or more next actions from an explicit allowlist
- execute through service/CLI actions
- tolerate retries without duplicating side effects
- record a short decision summary
- then stop

### Lifecycle Events

Lifecycle events are the wakeup mechanism. Examples:

- ticket implementation session started
- ticket implementation session completed
- review requested
- review completed
- issues found
- fixes completed
- QA requested
- user inbox response received
- PR created
- PR merged
- ticket marked done

These events should be service-created and durable. They wake explicit orchestrator sessions; they do not route through the ambient agent.

Each lifecycle event must carry stable identifiers and enough state for the orchestrator and UI to act without guessing:

- `projectRunId`
- `ticketId` when relevant
- execution id when relevant
- linked session ids when relevant
- previous and next status when a state transition happened
- action result or failure details when relevant

## Ticket Roadmap

The implementation is split into ten tickets:

### Deliverable 0

1. **Planning Workspace**: prompt-first project creation, normal planning session, split plan/chat UI.
2. **Plan Approval and Ticket Generation**: Next action, save plan, structured AI ticket drafts, service-created tickets.
3. **Project Ticket List**: project detail ticket list fed by durable project-linked tickets.

### Orchestration Foundation

4. **Ticket Execution Lifecycle**: start one implementation session per ticket and emit lifecycle events.
5. **Playbook Model**: store playbooks and provide the default review/QA/PR playbook.
6. **Orchestrator Episode Runtime**: start a new normal coding-tool session for each lifecycle event.
7. **Orchestrator Context Packet**: provide project, ticket, session, diff, history, and playbook context.
8. **Orchestrator Action Surface**: allow explicit service/CLI actions for messages, inbox, sessions, ticket updates, PRs, and merges.
9. **Default Playbook Loop**: implement the sequential implement/review/fix/QA/PR/merge loop.
10. **Project Autopilot UI**: show ticket progress, orchestrator decisions, inbox gates, and linked sessions.

## Testing Strategy

D0 tests:

- create a project from an initial prompt
- verify the planning session is linked to the project
- iterate plan text and chat without losing state
- click Next and verify the plan persists
- verify structured AI ticket draft generation creates DB tickets linked to the project through the service
- verify duplicate approval or retry does not duplicate tickets
- verify ticket events upsert full ticket/project-link state in the client store
- refresh and verify the project shows the plan and tickets

Orchestration tests:

- start the next ticket only when the project is ready
- emit lifecycle events for implementation completion and review completion
- start a new orchestrator session from each lifecycle event
- replay the same lifecycle event and verify exactly one episode/action result
- include playbook and relevant history in the context packet
- enforce context size bounds with large projects and long sessions
- verify the default playbook requests review after implementation
- verify human QA creates an inbox item
- verify user feedback resumes the loop
- verify PR/merge actions are explicit and permissioned

## Open Template Slot

The orchestrator context template is intentionally not fixed yet. The user will provide it later. Until then, tickets should define the data the context packet must be able to include, not the final prose prompt.
