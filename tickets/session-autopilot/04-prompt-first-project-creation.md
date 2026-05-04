# 04 — Prompt-First Project Creation

## Summary

Build the new project creation experience around the user's goal prompt.

## What needs to happen

- Add the initial project-run model and status enum:
  - `ProjectRun`
  - `ProjectRunStatus`
  - initial goal
  - plan summary
  - active gate pointer
  - latest controller summary pointer/text
  - execution config
- Add project-run service and GraphQL methods:
  - create first project run from a goal
  - get/list project runs for a project
  - update project-run status/summary
- Add client-core/Zustand support for:
  - project runs
  - project-run event hydration
  - active-run selectors by project
- Add project-run event payload contracts:
  - `project_run_created`: `{ projectRun }`
  - `project_run_updated`: `{ projectRun }`
  - `project_goal_submitted`: `{ projectRun, goal }`
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

- [x] New Project opens a prompt-first surface.
- [x] Initial goal is required.
- [x] Project-run schema and service methods exist before UI submit wiring depends on them.
- [x] Project-run events hydrate the normalized store.
- [x] Repo/member controls do not block the primary prompt flow.
- [x] Submit creates a project and project run.
- [x] Initial goal is recorded through a service method and event.
- [x] The user lands on the project planning page.
- [x] Empty/error/loading states are polished.
- [x] UI remains useful before AI planning is wired up.

## Implementation notes

- Do not make a landing page.
- Keep the first viewport focused on the input.
- Store draft prompt locally unless it must survive navigation.
- Enforce one active project run per project in the service layer.
- `ProjectRun` stores compact current state only; detailed planning turns belong to project-scoped events.
- Mutations should not update Zustand from mutation results. The resulting events hydrate the store.

## How to test

1. Open New Project.
2. Submit a project goal.
3. Verify project and project run appear in the store.
4. Refresh the resulting route and verify the project loads.
5. Attempt to create a second active run and verify service rejection.
