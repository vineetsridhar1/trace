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
- Emit project-scoped events for durable transitions.
- Add GraphQL types, queries, and mutations for the service methods.
- Keep existing `organizationService.createProject`, `project.create`, `project.linkEntity`, and `project.get` behavior working or migrate them intentionally.
- Regenerate shared GQL and resolver types with `pnpm gql:codegen`.

## Deliverable

Clients and agents can create/read/update projects through Trace services and typed GraphQL.

## Completion requirements

- [x] All project writes go through services.
- [x] All mutations validate organization and actor access.
  - Membership mutations must enforce an explicit project/org admin rule before GraphQL or agent actions expose add/remove member operations; ordinary org membership is not sufficient authority to edit project membership.
- [x] GraphQL resolvers delegate to services only.
- [x] Project creation emits a project event with a snapshot.
- [x] Historical project-link event behavior is preserved or intentionally adapted.
- [x] Generated client/server types compile.
- [x] Existing project actions continue to work or are migrated cleanly.

## Implementation notes

- Preserve existing `organizationService.createProject` callers or migrate them intentionally.
- Event payloads should include enough data for Zustand upserts.
- Project event snapshots should use the generated `Project` shape for nested relations, or expose lightweight linked-entity references under distinct payload fields instead of overloading `Project.channels`, `Project.sessions`, and `Project.tickets`.
- Do not duplicate generated GraphQL types elsewhere.
- Do not add project-run service methods in this ticket; those belong to prompt-first project creation.
- Resolvers should parse input, call services, and format output only.

## How to test

1. Service test project create/update.
2. Service test project member add/remove.
3. Service test emitted project event payloads.
4. Resolver test that GraphQL calls delegate to services.
