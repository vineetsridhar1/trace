# 02 — Project Services and GraphQL

## Summary

Expose the project foundation through service-layer methods and thin GraphQL wrappers.

## What needs to happen

- Add or extend `projectService`.
- Support:
  - create project
  - update project
  - list/get project
  - add/remove project member
  - create project run from a goal
  - update project run summary/status
- Emit project-scoped events for durable transitions.
- Add GraphQL types, queries, and mutations for the service methods.
- Regenerate shared GQL and resolver types with `pnpm gql:codegen`.

## Deliverable

Clients and agents can create/read/update projects and project runs through Trace services and typed GraphQL.

## Completion requirements

- [ ] All project writes go through services.
- [ ] All mutations validate organization and actor access.
- [ ] GraphQL resolvers delegate to services only.
- [ ] Project creation emits a project event with a snapshot.
- [ ] Project-run creation records the initial goal and emits an event.
- [ ] Generated client/server types compile.
- [ ] Existing project actions continue to work or are migrated cleanly.

## Implementation notes

- Preserve existing `organizationService.createProject` callers or migrate them intentionally.
- Event payloads should include enough data for Zustand upserts.
- Do not duplicate generated GraphQL types elsewhere.

## How to test

1. Service test project create/update.
2. Service test project member add/remove.
3. Service test project-run creation from a goal.
4. Resolver test that GraphQL calls delegate to services.
