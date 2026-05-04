# 04 — Ticket Execution Lifecycle

## Summary

Start the orchestration phase by running one ticket at a time through normal implementation sessions and durable lifecycle events.

## Scope

- Add ticket execution records for a project run.
- Start one implementation session for one ticket.
- Link implementation sessions to project, project run, and ticket.
- Model execution as a durable state machine. At minimum track queued/ready, running, reviewing, fixing, needs_human, blocked, completed, failed, cancelled, and linked session ids as the loop requires.
- Enforce one active execution per project run in the database or a transactionally acquired lock.
- Emit service-created lifecycle events:
  - ticket execution started
  - implementation session completed
  - implementation failed/stopped
  - review requested/completed
  - PR created/merged when available
- Keep lifecycle events durable enough to wake orchestrator episodes later.
- Put lifecycle event types in `packages/gql/src/schema.graphql` and regenerate. Do not duplicate enums in server or client code.
- Include previous status, next status, `projectRunId`, `ticketId`, execution id, and linked session ids in event payloads.

## Completion requirements

- [ ] A project run can start the next ticket manually or through an explicit command.
- [ ] Only one ticket executes at a time in v1.
- [ ] Ticket execution state is durable.
- [ ] Implementation session links back to the project and ticket.
- [ ] Lifecycle events are service-created.
- [ ] State transitions and event appends happen in the same transaction when possible.
- [ ] Duplicate start commands or replayed lifecycle events do not create duplicate executions or sessions.
- [ ] Terminal session states map to execution lifecycle events through a service, not UI inference.
- [ ] Lifecycle events do not use ambient routing.

## Notes

- This ticket creates the event vocabulary the orchestrator will consume in ticket 06.
- Ticket status is user-facing work state; execution records are automation state. Do not collapse them unless the service owns the mapping explicitly.
