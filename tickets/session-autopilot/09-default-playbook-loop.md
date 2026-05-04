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

## Completion requirements

- [ ] Orchestrator starts the first ready ticket.
- [ ] Implementation completion leads to review.
- [ ] Review issues lead to a fix session.
- [ ] Human QA creates an inbox item.
- [ ] User suggestions resume the loop.
- [ ] PR creation/merge are explicit actions.
- [ ] Completing a ticket advances to the next ticket.
- [ ] The loop stops cleanly when all tickets are done.

## Notes

- Keep v1 sequential. Parallel ticket execution should wait until this loop is reliable.
