# 03 — Project Client Shell

## Summary

Make projects visible and navigable as first-class client entities.

## What needs to happen

- Add client-core/Zustand support for:
  - projects
  - project runs
  - project-scoped events
- Add event handlers for project and project-run events.
- Add Projects navigation.
- Add project list view.
- Add project detail shell.
- Show project name, repo, members, latest activity, and active run status when present.

## Deliverable

Users can find, open, and inspect projects as real workspaces before prompt-first creation or AI planning exists.

## Completion requirements

- [ ] Project events update normalized store state.
- [ ] Project-scoped events are stored by scope.
- [ ] Projects appear in primary navigation.
- [ ] Project list loads from GraphQL and hydrates Zustand.
- [ ] Project detail route works on refresh/deep link.
- [ ] Project members are visible.
- [ ] Empty states guide the user to create or start a project.

## Implementation notes

- Keep the project shell ready for sections:
  - overview
  - planning
  - tickets
  - activity
- Use shadcn/ui and existing Tailwind tokens.
- Prefer entity IDs and fine-grained selectors.

## How to test

1. Create a project through a seed or mutation.
2. Verify it appears in the project list.
3. Open the project detail route.
4. Verify event delivery updates the project without refetching.
