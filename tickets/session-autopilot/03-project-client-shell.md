# 03 — Project Client Shell

## Summary

Make projects visible and navigable as first-class client entities.

## What needs to happen

- Add client-core/Zustand support for:
  - projects
  - project-scoped events
- Add event handlers for project and project-member events.
- Add Projects navigation.
- Add project list view.
- Add project detail shell.
- Show project name, repo, members, and latest activity.

## Deliverable

Users can find, open, and inspect projects as real workspaces before prompt-first creation or AI planning exists.

## Completion requirements

- [x] Project events update normalized store state.
- [x] Project-scoped events are stored by scope.
- [x] Projects appear in primary navigation.
- [x] Project list loads from GraphQL and hydrates Zustand.
- [x] Project detail route works on refresh/deep link.
- [x] Project members are visible.
- [x] Empty states guide the user to create or start a project.
- [x] Historical project-link events and new project events both hydrate correctly.
  - Historical project hydration must not synthesize blank `organizationId` values; use current org/event context or keep the legacy record out of the normalized `Project` entity shape.
- [x] Project detail loads historical latest activity on refresh/deep link.
- [x] Project live-event handling avoids duplicate notification/store side effects when the org-wide subscription is also active.

## Implementation notes

- Keep the project shell ready for sections:
  - overview
  - planning
  - tickets
  - activity
- Use shadcn/ui and existing Tailwind tokens.
- Prefer entity IDs and fine-grained selectors.
- Store project-scoped events with `eventsByScope` and `eventScopeKey()`, not generic entity tables.
- Do not add project-run UI state in this ticket.

## How to test

1. Create a project through a seed or mutation.
2. Verify it appears in the project list.
3. Open the project detail route.
4. Verify event delivery updates the project without refetching.
5. Verify historical project-link event hydration still works.
