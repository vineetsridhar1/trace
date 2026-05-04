# 01 — Planning Workspace

## Summary

Build the Deliverable 0 planning workspace: prompt-first project creation, a normal project-linked planning session, and a split view with plan on the left and chat on the right.

## Scope

- Create project and first project run from the initial prompt.
- Start a normal planning session linked to the project.
- Persist enough linkage to recover both `projectId` and `projectRunId` for the planning session after refresh. Do not rely on UI-only props or transient prompt text as the source of truth.
- Seed the session with an interviewer prompt in plan mode.
- Show a split workspace:
  - editable/reviewable plan on the left
  - session chat/interview on the right
- Keep the planning session inspectable as a normal session.
- Keep draft planning state in durable project/session events or project-run state, then hydrate it into Zustand. Do not use local React state as the only copy of the plan.
- Do not route planning through the ambient agent.

## Completion requirements

- [ ] User can create a project from one prompt.
- [ ] Project creation starts a normal linked planning session.
- [ ] Planning UI shows plan left, chat right.
- [ ] The user can iterate with the AI before committing the plan.
- [ ] Refresh restores the project, run, linked session, and current plan state.
- [ ] Project and project-run events carry enough payload for the client store to upsert the entities directly.
- [ ] The planning UI uses entity IDs and fine-grained Zustand selectors for shared state.
- [ ] No project planning event wakes the ambient agent.

## Notes

- The plan can start as session-derived state, but the confirmed plan must be saved through ticket 02.
- Keep D0 focused on planning and tickets, not execution.
- If schema changes are needed, add them to `packages/gql/src/schema.graphql` first and regenerate types. Do not duplicate project-run or session-link types outside codegen.
