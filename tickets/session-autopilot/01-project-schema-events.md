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
  - project link compatibility events
- Define v1 project event payload contracts:
  - `project_created`: `{ project }`
  - `project_updated`: `{ project }`
  - `project_member_added`: `{ projectId, member }`
  - `project_member_removed`: `{ projectId, userId, leftAt }`
- Add migration and Prisma generate.
- Preserve compatibility with historical `system` scoped `entity_linked` project events.

## Deliverable

Projects can act as first-class workspaces with members and project-scoped events before any project-run, AI, ticket-generation, or execution work ships.

## Completion requirements

- [x] Existing projects migrate cleanly.
- [x] Project members can be created independently of channel members.
- [x] Project events can use `ScopeType.project`.
- [ ] Project event payloads include enough data for client upserts.
  - Review note: project snapshots currently use partial linked `channels`, `sessions`, and `tickets`. Before marking complete, emit GraphQL-shaped snapshots or move lightweight link refs to separate payload fields so Zustand does not store incomplete entity objects.
- [x] Historical project-created/link events remain readable.
- [ ] Migration runs cleanly on an existing local database.
  - Review note: `pnpm db:migrate` could not be verified in the current workspace because `DATABASE_URL` is unset.

## Implementation notes

- Keep projects as org-scoped peer entities.
- Do not add `ProjectRun` in this ticket.
- Do not make project membership the only visibility rule until the rollout explicitly enables enforcement.
- Backfill project members conservatively; existing org admins must not lose project visibility.
- Update `packages/gql/src/schema.graphql` first for GraphQL-facing types, then run `pnpm gql:codegen`.
- Do not duplicate generated GraphQL enum/type definitions in app code.

## How to test

1. Run the Prisma migration.
2. Run Prisma generate.
3. Create a project with members.
4. Create a project-scoped event.
5. Verify historical project events still hydrate.
