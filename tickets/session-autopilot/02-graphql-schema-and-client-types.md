# 02 — GraphQL Schema and Client Types

## Summary

Expose Project Orchestration contracts through GraphQL while keeping resolvers thin wrappers over services.

## What needs to happen

- Add schema support for:
  - project members
  - project-scoped events
  - project runs
  - planned tickets
  - ticket acceptance criteria
  - ticket test plans
  - ticket dependencies
- Add project queries:
  - list projects
  - get project detail
  - get project runs
  - get project tickets
- Add mutations:
  - create/update project
  - join/leave or add/remove project member
  - create project run from a goal
  - update project run summary/state
  - add/update planned ticket
  - add/remove ticket dependency
- Regenerate shared GQL and resolver types with `pnpm gql:codegen`.

## Deliverable

Clients and services can talk about projects, project runs, planning state, and project tickets through typed GraphQL.

## Completion requirements

- [ ] Schema compiles.
- [ ] Generated client/server types compile.
- [ ] No duplicated enum/type definitions are introduced outside schema/codegen.
- [ ] Project resolvers call services only.
- [ ] Ticket resolvers expose planning fields.
- [ ] Queries support project-scoped tickets without requiring channel IDs.
- [ ] Existing project/ticket/session queries remain compatible.

## Implementation notes

- Prefer adding project-specific fields to existing types over inventing parallel ticket types.
- Keep mutation return payloads useful for optimistic UI, but state hydration should still come from events.
- Use generated types from `@trace/gql`.

## How to test

1. Run `pnpm gql:codegen`.
2. Run TypeScript checks for gql/server/web packages.
3. Add resolver tests for project-run and project-ticket query paths.
