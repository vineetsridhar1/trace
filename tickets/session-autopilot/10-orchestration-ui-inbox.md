# 10 — Orchestration UI And Inbox

## Summary

Expose orchestration progress, decisions, linked sessions, and human gates in the project UI.

## Scope

- Show ticket execution state on the project.
- Show current/previous orchestrator episodes.
- Show linked implementation/review/fix sessions.
- Show playbook-selected next action.
- Show inbox items for QA and user decisions.
- Let the user pause/resume/cancel a project run.
- Keep UI state sourced from durable services/events.

## Completion requirements

- [ ] Project UI shows ticket progress and active execution.
- [ ] Orchestrator decisions are visible.
- [ ] Linked sessions are easy to open.
- [ ] Inbox QA items link back to project/ticket/session context.
- [ ] User can pause/resume/cancel orchestration.
- [ ] Refresh reconstructs the orchestration state.
- [ ] UI never depends on ambient agent state.

## Notes

- This ticket makes the automation inspectable and controllable before adding parallelism.
