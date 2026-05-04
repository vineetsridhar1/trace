# 02 — Plan Approval And Ticket Generation

## Summary

Implement the **Next** step for Deliverable 0: save the confirmed plan through the service layer, ask the active Claude Code/Codex planning session to produce structured ticket drafts through the Trace CLI/API action surface, then validate and create durable project tickets in a service-owned batch.

## Scope

- Add a Next/confirm action from the planning workspace.
- Save the approved plan to `ProjectRun`.
- Start or reuse a durable ticket-generation attempt. If drafts are not supplied yet, leave the attempt pending/retryable and instruct the active planning session to submit drafts through the Trace CLI/API.
- Give the active planning session the approved plan and project context, then validate the submitted structured drafts with runtime narrowing before persistence.
- Do not call an LLM from the server to generate ticket drafts. Claude Code/Codex should use their own model/tool runtime and submit drafts back through the service-owned action.
- Create tickets through a service method that owns authorization, validation, transaction boundaries, event creation, and retry behavior.
- Link created tickets to the project.
- Return structured success/failure output to the UI.
- Remove the web-client markdown parsing path for approved project plans. The UI should call the approval/generation action and wait for service-created events to hydrate state.
- Include ticket provenance, such as `projectRunId`, generation attempt id, or source event id, in service metadata/events so retries can dedupe.

## Completion requirements

- [ ] Next persists the approved plan to the DB.
- [ ] Ticket generation runs only after explicit user confirmation.
- [ ] The active Claude Code/Codex planning session produces structured ticket drafts through the Trace CLI/API; the service creates tickets and events.
- [ ] Generated tickets include title, description, priority, labels, and enough acceptance detail to execute.
- [ ] Approving without drafts creates/reuses a pending generation attempt instead of failing on missing model-provider credentials.
- [ ] Duplicate approval, retry, or event replay does not duplicate tickets.
- [ ] Partial ticket generation failures are visible and recoverable.
- [ ] All generated tickets are linked to the project.
- [ ] Ticket-created events include the full ticket payload and project links needed by Zustand.
- [ ] The UI does not use mutation results as the source of truth for ticket list state.
- [ ] The flow does not use the ambient agent.

## Notes

- The first implementation can use a simple structured CLI command. It does not need the final orchestrator context template.
- The CLI command must authenticate with dynamically injected, scoped credentials from session startup. Users should not provide model-provider API keys for ticket generation, and the server should not need provider credentials for this path.
- Prefer one transaction for saving the approved plan and creating tickets when drafts already exist. If draft generation is asynchronous, persist an attempt record and keep retries idempotent.
- Failed generation should leave the run in a recoverable state with a visible error and a safe retry action.
