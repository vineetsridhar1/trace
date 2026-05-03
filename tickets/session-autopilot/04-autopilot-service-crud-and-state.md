# 04 — Project Service CRUD and Events

## Summary

Implement service-layer project operations and event emission. This is the service foundation for prompt-first creation and planning.

## What needs to happen

- Add or extend `projectService`.
- Support:
  - create project
  - update project
  - add/remove project member
  - list/get project with linked entities
  - create project run from an initial goal
  - update project run summary/status
- Emit project-scoped events for durable transitions.
- Ensure event payloads contain snapshots for client upserts.
- Preserve existing `organizationService.createProject` behavior or migrate callers cleanly.

## Deliverable

Projects and project runs can be created and updated through services, with events as the source of truth for clients.

## Completion requirements

- [ ] All writes go through services.
- [ ] All mutations validate organization and actor access.
- [ ] Project creation emits a project event.
- [ ] Project member changes emit project events.
- [ ] Project run creation records the initial goal and emits an event.
- [ ] Event payloads include enough project/run snapshots for the client store.
- [ ] Existing agent `project.create` and `project.linkEntity` actions still work or are updated.

## Implementation notes

- Avoid putting project business logic in GraphQL resolvers.
- Keep linked entity behavior service-owned.
- Use transactions for DB writes plus event creation.

## How to test

1. Service test: create project.
2. Service test: add/remove member.
3. Service test: create project run from goal.
4. Verify emitted event payloads hydrate project and project run state.
