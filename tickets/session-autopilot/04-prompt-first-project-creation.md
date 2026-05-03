# 04 — Prompt-First Project Creation

## Summary

Build the new project creation experience around the user's goal prompt.

## What needs to happen

- Add a "New Project" action from the project list/navigation.
- Show a prompt-first screen where the user can describe the project immediately.
- Allow repo/member choices as secondary controls.
- On submit:
  - create the project
  - create the first project run
  - record the initial goal
  - navigate to the project planning surface
- Show loading and error states.

## Deliverable

A user can start a project by typing what they want to build.

## Completion requirements

- [ ] New Project opens a prompt-first surface.
- [ ] Initial goal is required.
- [ ] Repo/member controls do not block the primary prompt flow.
- [ ] Submit creates a project and project run.
- [ ] The user lands on the project planning page.
- [ ] Empty/error/loading states are polished.
- [ ] UI remains useful before AI planning is wired up.

## Implementation notes

- Do not make a landing page.
- Keep the first viewport focused on the input.
- Store draft prompt locally unless it must survive navigation.

## How to test

1. Open New Project.
2. Submit a project goal.
3. Verify project and project run appear in the store.
4. Refresh the resulting route and verify the project loads.
