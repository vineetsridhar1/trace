# 09 — Default Playbook Loop

## Summary

Implement the first end-to-end sequential playbook loop: implement, review, fix, QA, PR, merge, then move to the next ticket.

## Scope

- Start ticket 1 from the project ticket list.
- On implementation completion, start an orchestrator episode.
- The episode reads the playbook and requests review.
- On review completion, decide whether to fix issues or ask for QA.
- Put human QA in the inbox when needed.
- Resume after inbox feedback.
- Create PR and merge when configured conditions are met.
- Move to the next ticket after completion.
- Treat the service state machine as the source of truth. The playbook guides choices among allowed actions; it does not define valid state transitions by itself.
- Define the first-ticket and next-ticket selection order explicitly, including what happens when a ticket is blocked, cancelled, or already complete.
- Respect pause/resume/cancel gates before every automated action.
- Keep PR creation and merge explicit, permissioned, and disableable in run/project/org configuration.

## Completion requirements

- [ ] Orchestrator starts the first ready ticket.
- [ ] Implementation completion leads to review.
- [ ] Review issues lead to a fix session.
- [ ] Human QA creates an inbox item.
- [ ] User suggestions resume the loop.
- [ ] PR creation/merge are explicit actions.
- [ ] Completing a ticket advances to the next ticket.
- [ ] The loop stops cleanly when all tickets are done.
- [ ] Pausing or cancelling the run prevents new sessions, reviews, PRs, and merges.
- [ ] Replayed completion/review/inbox events do not duplicate sessions or actions.
- [ ] Blocked or failed tickets leave the run in an inspectable, recoverable state.

## Notes

- Keep v1 sequential. Parallel ticket execution should wait until this loop is reliable.
- Sequential means one active execution per project run, not one active execution globally.
