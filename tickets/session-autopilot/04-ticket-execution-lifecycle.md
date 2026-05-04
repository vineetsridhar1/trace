# 04 — Ticket Execution Lifecycle

## Summary

Start the orchestration phase by running one ticket at a time through normal implementation sessions and durable lifecycle events.

## Scope

- Add ticket execution records for a project run.
- Start one implementation session for one ticket.
- Link implementation sessions to project, project run, and ticket.
- Emit service-created lifecycle events:
  - ticket execution started
  - implementation session completed
  - implementation failed/stopped
  - review requested/completed
  - PR created/merged when available
- Keep lifecycle events durable enough to wake orchestrator episodes later.

## Completion requirements

- [ ] A project run can start the next ticket manually or through an explicit command.
- [ ] Only one ticket executes at a time in v1.
- [ ] Ticket execution state is durable.
- [ ] Implementation session links back to the project and ticket.
- [ ] Lifecycle events are service-created.
- [ ] Lifecycle events do not use ambient routing.

## Notes

- This ticket creates the event vocabulary the orchestrator will consume in ticket 06.
