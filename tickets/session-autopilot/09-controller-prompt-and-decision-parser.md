# 09 — Controller Tool and Summary Contract

## Summary

Define how each fresh Ultraplan controller run reasons and acts: its system prompt, runtime action executable contract, controller skill/instructions, and required structured summary.

## What needs to happen

- Author the base controller-run prompt.
- Make the controller's role explicit:
  - manage the ordered ticket plan
  - create and update `UltraplanTicket` plan membership
  - record dependency edges so future DAG scheduling is possible
  - launch or continue worker sessions
  - review completed/failed workers
  - update current and future tickets
  - request human gates
  - request integration of approved branches
  - emit a final structured run summary before completing
- Define the initial runtime action surface exposed through `trace-agent` or equivalent:
  - `ticket.create`
  - `ticket.update`
  - `ticket.addComment`
  - `ticket.updateAcceptanceCriteria`
  - `ticket.updateTestPlan`
  - `ticket.addDependency`
  - `ticket.reorder`
  - `ultraplan.addPlannedTicket`
  - `ultraplan.updatePlannedTicket`
  - `ultraplan.reorderPlannedTickets`
  - `ultraplan.createTicketExecution`
  - `ultraplan.startWorker`
  - `ultraplan.sendWorkerMessage`
  - `ultraplan.requestHumanGate`
  - `ultraplan.markExecutionReady`
  - `ultraplan.markExecutionBlocked`
  - `ultraplan.completeControllerRun`
  - `integration.mergeTicketBranch`
  - `integration.rebaseTicketBranch`
  - `integration.reportConflict`
- Define the structured summary schema.
- Define the controller-run skill/instructions file that teaches the agent how to call the runtime executable.
- Fail safe when controller output is malformed or missing the required summary.

## Dependencies

- [08 — Controller Run Context Packet Builder](08-autopilot-context-packet-builder.md)
- [17 — Runtime Action Wrapper and Auth Plumbing](17-runtime-action-wrapper-and-auth-plumbing.md)

## Completion requirements

- [x] Prompt contract is checked into the repo.
- [x] Runtime action contract is narrow and service-backed.
- [x] Controller-run skill/instructions explain executable usage and expected JSON input/output.
- [x] Prompt requires acceptance criteria, test plans, and dependency rationale for generated tickets.
- [x] Prompt creates durable planned-ticket membership before worker execution.
- [x] Prompt requires a structured summary for every completed controller run.
- [x] Controller is instructed not to mutate DB/events/git directly.
- [x] Malformed output does not result in speculative actions.
- [x] Missing or invalid summaries fail visibly.
- [x] Runtime action validation errors are observable to the service/router and controller transcript.

## Implementation notes

- Do not let this ticket drift into orchestration or inbox creation.
- Prefer executable-backed actions over free-form action JSON.
- The final structured output is for the run summary, not primary action execution.

## How to test

1. Unit test valid runtime action requests.
2. Unit test valid controller run summaries.
3. Unit test malformed output and missing summary.
4. Verify forbidden actions are rejected by validation.
5. Verify generated plans can express a linear dependency chain.
6. Verify prompts include the service-layer boundary clearly.
7. Verify the controller-run skill tells the agent how to use `trace-agent`.
