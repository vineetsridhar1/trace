# 01 — Planning Workspace

## Summary

Build the Deliverable 0 planning workspace: prompt-first project creation, a normal project-linked planning session, and a split view with plan on the left and chat on the right.

## Scope

- Create project and first project run from the initial prompt.
- Start a normal planning session linked to the project.
- Seed the session with an interviewer prompt in plan mode.
- Show a split workspace:
  - editable/reviewable plan on the left
  - session chat/interview on the right
- Keep the planning session inspectable as a normal session.
- Do not route planning through the ambient agent.

## Completion requirements

- [ ] User can create a project from one prompt.
- [ ] Project creation starts a normal linked planning session.
- [ ] Planning UI shows plan left, chat right.
- [ ] The user can iterate with the AI before committing the plan.
- [ ] Refresh restores the project, run, linked session, and current plan state.
- [ ] No project planning event wakes the ambient agent.

## Notes

- The plan can start as session-derived state, but the confirmed plan must be saved through ticket 02.
- Keep D0 focused on planning and tickets, not execution.
