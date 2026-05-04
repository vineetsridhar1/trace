# 06 — Session-Backed Planning Interview

## Summary

Start project planning through a normal project-linked Trace session, not the ambient agent.

## What needs to happen

- When a user submits the initial project goal:
  - create the project
  - create the first project run
  - start a normal session linked to the project
  - seed that session with an interviewer prompt and the initial goal
- The interviewer session should:
  - ask focused clarifying questions
  - help the user shape a concrete plan
  - avoid editing files or implementing work
  - present a plan for explicit confirmation
- The project detail surface should show:
  - the session chat/transcript on the left
  - the durable plan summary and ticket list on the right
- On plan confirmation:
  - save the approved plan summary to the project run
  - create linked project tickets
  - leave implementation paused until the user starts ticket execution
- Project planning events must not route through the ambient agent.

## Deliverable

A user can create a project from a prompt, interview with a normal project-linked session, approve the plan, and then see generated tickets on the project detail view.

## Completion requirements

- [x] Prompt-first project creation starts a normal project-linked session.
- [x] The interviewer prompt is stored in the repo.
- [x] Project detail embeds the linked session chat beside project planning state.
- [x] Plan approval saves the plan summary through Trace services.
- [x] Plan approval creates linked project tickets through `ticketService`.
- [x] Project detail shows the linked ticket list.
- [x] Project planning event types are not aggregated by the ambient router.
- [x] The interviewer prompt tells the session not to implement before explicit ticket execution.

## Implementation notes

- Use `startSession(projectId: ...)` so the interviewer is an ordinary Trace session with a project link.
- Keep the session transcript inspectable, but keep approved artifacts durable in project run and ticket tables.
- Do not use ambient agent routing for project planning starts or follow-up answers.
- Ticket extraction can be simple for the first slice; the durable ticket-generation model can replace it later.

## How to test

1. Create a project from an initial goal.
2. Verify a linked session starts and appears on the project detail page.
3. Have the session produce a plan review.
4. Approve the plan and verify the project run stores the plan summary.
5. Verify linked tickets appear when reopening the project.
6. Verify project planning events are not aggregated by the ambient router.
