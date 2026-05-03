# 01 — Project Schema and Events

## Summary

Add the durable database and event foundation for project-first planning.

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
- Add project-run core model:
  - `ProjectRun`
  - `ProjectRunStatus`
  - initial goal
  - plan summary
  - active gate/status fields
- Add migration and Prisma generate.

## Deliverable

Projects can act as first-class workspaces with members, project-scoped events, and project runs before any AI or execution work ships.

## Completion requirements

- [ ] Existing projects migrate cleanly.
- [ ] Project members can be created independently of channel members.
- [ ] Project events can use `ScopeType.project`.
- [ ] Project runs can exist without tickets, sessions, or executions.
- [ ] Project-run state changes can be represented by events.
- [ ] Migration runs cleanly on an existing local database.

## Implementation notes

- Keep projects as org-scoped peer entities.
- Do not anchor project runs to session groups.
- Do not put project planning state only in JSON.

## How to test

1. Run the Prisma migration.
2. Run Prisma generate.
3. Create a project with members.
4. Create a project-scoped event.
5. Create a project run from an initial goal.
