# 03 — Project Navigation and Membership UI

## Summary

Make projects visible as first-class workspaces before AI planning or orchestration is complete.

## What needs to happen

- Add a Projects navigation entry.
- Add a project list view.
- Add a project detail shell.
- Show project name, repo, members, latest activity, and active run status when present.
- Add basic member display and add/remove affordances if the service contract is ready.
- Preserve existing channels, tickets, and sessions navigation.

## Deliverable

Users can find and open projects as a real product surface.

## Completion requirements

- [ ] Projects appear in primary navigation.
- [ ] Project list loads from GraphQL and hydrates Zustand.
- [ ] Project detail route works on refresh/deep link.
- [ ] Project members are visible.
- [ ] Empty states guide the user to create or start a project.
- [ ] UI uses shadcn/ui and existing Tailwind tokens.
- [ ] Components use IDs and fine-grained Zustand selectors where practical.

## Implementation notes

- Do not build the full planning UI here.
- Keep the project shell small but structurally ready for tabs/sections:
  - overview
  - planning
  - tickets
  - activity
- Reuse existing sidebar and header patterns.

## How to test

1. Create a project through a seed or mutation.
2. Verify it appears in the project list.
3. Open the project detail route.
4. Verify member and repo data render without layout shifts.
