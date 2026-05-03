# 01 — Project Contracts and Event Types

## Summary

Add the durable schema foundation for Project Orchestration without requiring autonomous execution to ship immediately.

## What needs to happen

- Add project membership:
  - `ProjectMember`
  - project member role
  - joined/left timestamps
- Add `ScopeType.project`.
- Add project event types:
  - project created/updated
  - project member added/removed
  - project goal submitted
  - project planning events
  - project run lifecycle events
  - project planned-ticket events
- Add ticket planning fields:
  - acceptance criteria
  - test plan
- Add general `TicketDependency` edges.
- Add durable project-run contracts that can be used before execution:
  - `ProjectRun`
  - `ProjectRunStatus`
  - `ProjectPlanTicket`
  - `ProjectPlanTicketStatus`
- Add controller/execution enums only if needed by follow-on tickets, but keep them project-named:
  - `ProjectControllerRunStatus`
  - `TicketExecutionStatus`
  - `SessionRole.project_controller_run`
  - `SessionRole.ticket_worker`

## Deliverable

The database can represent projects as first-class workspaces, project-scoped planning, durable planned tickets, and ticket dependencies. No worker orchestration is required for this ticket to be useful.

## Completion requirements

- [ ] Existing project records migrate cleanly.
- [ ] Existing sessions default to the primary role if session roles are added here.
- [ ] Project members can be represented without channel membership.
- [ ] Project events can use `ScopeType.project`.
- [ ] Ticket acceptance criteria and test plans are durable fields.
- [ ] Ticket dependencies can represent both a chain and a DAG.
- [ ] Project runs can exist before any ticket execution exists.
- [ ] Planned tickets can exist before worker sessions exist.
- [ ] Migration runs cleanly on an existing local database.

## Implementation notes

- Keep projects as org-scoped peer entities.
- Do not move tickets under projects; use links and `ProjectPlanTicket`.
- Do not store the project plan only in JSON or markdown.
- Do not anchor project runs to session groups.

## How to test

1. Run the Prisma migration.
2. Run Prisma generate.
3. Create a project with members in a test transaction.
4. Create a project-scoped event.
5. Create a project run with planned tickets.
6. Create a ticket dependency chain and a branching dependency graph.
