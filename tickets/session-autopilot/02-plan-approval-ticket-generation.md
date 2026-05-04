# 02 — Plan Approval And Ticket Generation

## Summary

Implement the **Next** step for Deliverable 0: save the confirmed plan to the DB, then prompt AI to create durable project tickets through the CLI/service layer.

## Scope

- Add a Next/confirm action from the planning workspace.
- Save the approved plan to `ProjectRun`.
- Start or reuse an explicit AI ticket-generation session/CLI command.
- Give the AI the approved plan and project context.
- Create tickets through service-backed CLI/GraphQL commands.
- Link created tickets to the project.
- Return structured success/failure output to the UI.

## Completion requirements

- [ ] Next persists the approved plan to the DB.
- [ ] Ticket generation runs only after explicit user confirmation.
- [ ] AI creates tickets via CLI/service calls, not direct DB writes.
- [ ] Generated tickets include title, description, priority, labels, and enough acceptance detail to execute.
- [ ] Partial ticket generation failures are visible and recoverable.
- [ ] All generated tickets are linked to the project.
- [ ] The flow does not use the ambient agent.

## Notes

- The first implementation can use a simple structured CLI command. It does not need the final orchestrator context template.
- Prefer a transaction or clear compensation strategy so failed generation does not leave confusing half-plans.
