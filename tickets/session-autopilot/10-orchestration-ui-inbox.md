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
- Hydrate execution state, episodes, decisions, linked sessions, and inbox gates from scoped events and entity tables in Zustand.
- Use IDs as component props and fine-grained selectors for shared entity state.
- Virtualize long ticket, event, decision, and session lists.
- Avoid reading mutation results to update shared state. Mutations fire-and-forget; service-created events reconcile the store.

## Completion requirements

- [ ] Project UI shows ticket progress and active execution.
- [ ] Orchestrator decisions are visible.
- [ ] Linked sessions are easy to open.
- [ ] Inbox QA items link back to project/ticket/session context.
- [ ] User can pause/resume/cancel orchestration.
- [ ] Refresh reconstructs the orchestration state.
- [ ] Large projects remain usable without rendering every ticket/event/session row.
- [ ] UI controls call thin GraphQL mutations that delegate to services.
- [ ] Project-run events include enough data for optimistic or event-driven store reconciliation.
- [ ] UI never depends on ambient agent state.

## Notes

- This ticket makes the automation inspectable and controllable before adding parallelism.
- Add pagination before the UI depends on unbounded project detail queries.
