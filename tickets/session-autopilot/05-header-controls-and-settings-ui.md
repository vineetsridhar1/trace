# 05 — Prompt-First Project Creation UI

## Summary

Build the new project creation experience around the user's goal prompt, not a form-first setup flow.

## What needs to happen

- Add a "New Project" action from the project list/navigation.
- Show a prompt-first screen inspired by the ChatGPT home-page interaction pattern.
- Let the user type a broad project goal immediately.
- Optionally allow repo selection and member selection as secondary controls.
- On submit:
  - call service/GraphQL to create the project
  - create the first project run with the initial goal
  - navigate to the project planning surface
- Show loading/error states.

## Deliverable

A user can start a project by typing what they want to build.

## Completion requirements

- [ ] New Project opens a prompt-first surface.
- [ ] Initial goal is required.
- [ ] Repo/member options do not block the primary prompt flow.
- [ ] Submit creates a project and project run.
- [ ] The user lands on the project planning page.
- [ ] Empty/error/loading states are polished.
- [ ] UI remains useful before AI planning is wired up.

## Implementation notes

- Do not make a marketing landing page.
- Keep the first viewport focused on the input.
- Store any draft prompt in local component state only unless it must survive navigation.

## How to test

1. Open New Project.
2. Submit a project goal.
3. Verify project and project run appear in the store.
4. Refresh the resulting route and verify the project loads.
