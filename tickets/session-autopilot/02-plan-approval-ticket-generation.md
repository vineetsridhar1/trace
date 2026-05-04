# 02 — Plan Approval And Ticket Generation

## Summary

Implement the **Next** step for Deliverable 0: save the confirmed plan through the service layer, ask AI for structured ticket drafts, then validate and create durable project tickets in a service-owned batch.

## Scope

- Add a Next/confirm action from the planning workspace.
- Save the approved plan to `ProjectRun`.
- Start or reuse an explicit AI ticket-generation session/command only to produce structured drafts.
- Give the AI the approved plan and project context, then validate its output with runtime narrowing before persistence.
- Create tickets through a service method that owns authorization, validation, transaction boundaries, event creation, and retry behavior.
- Link created tickets to the project.
- Return structured success/failure output to the UI.
- Remove the web-client markdown parsing path for approved project plans. The UI should call the approval/generation action and wait for service-created events to hydrate state.
- Include ticket provenance, such as `projectRunId`, generation attempt id, or source event id, in service metadata/events so retries can dedupe.

## Completion requirements

- [ ] Next persists the approved plan to the DB.
- [ ] Ticket generation runs only after explicit user confirmation.
- [ ] AI produces structured ticket drafts; the service creates tickets and events.
- [ ] Generated tickets include title, description, priority, labels, and enough acceptance detail to execute.
- [ ] Duplicate approval, retry, or event replay does not duplicate tickets.
- [ ] Partial ticket generation failures are visible and recoverable.
- [ ] All generated tickets are linked to the project.
- [ ] Ticket-created events include the full ticket payload and project links needed by Zustand.
- [ ] The UI does not use mutation results as the source of truth for ticket list state.
- [ ] The flow does not use the ambient agent.

## Notes

- The first implementation can use a simple structured CLI command. It does not need the final orchestrator context template.
- Prefer one transaction for saving the approved plan and creating tickets when drafts already exist. If draft generation is asynchronous, persist an attempt record and keep retries idempotent.
- Failed generation should leave the run in a recoverable state with a visible error and a safe retry action.
