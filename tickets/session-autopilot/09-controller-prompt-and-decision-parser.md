# 09 — Controller Tool and Summary Contract

## Summary

Define how each fresh Ultraplan controller run reasons and acts: its system prompt, allowed service-backed tools, and required structured summary.

## What needs to happen

- Author the base controller-run prompt.
- Make the controller's role explicit:
  - manage the ordered ticket plan
  - record dependency edges so future DAG scheduling is possible
  - launch or continue worker sessions
  - review completed/failed workers
  - update current and future tickets
  - request human gates
  - request integration of approved branches
  - emit a final structured run summary before completing
- Define the initial tool surface:
  - `ticket.create`
  - `ticket.update`
  - `ticket.addComment`
  - `ticket.updateAcceptanceCriteria`
  - `ticket.updateTestPlan`
  - `ticket.addDependency`
  - `ticket.reorder`
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
- Define a strict structured output fallback for runtimes that cannot call tools directly.
- Fail safe when controller output is malformed or missing the required summary.

## Dependencies

- [08 — Controller Run Context Packet Builder](08-autopilot-context-packet-builder.md)

## Completion requirements

- [ ] Prompt contract is checked into the repo.
- [ ] Tool contract is narrow and service-backed.
- [ ] Prompt requires acceptance criteria, test plans, and dependency rationale for generated tickets.
- [ ] Prompt requires a structured summary for every completed controller run.
- [ ] Controller is instructed not to mutate DB/events/git directly.
- [ ] Malformed output does not result in speculative actions.
- [ ] Missing or invalid summaries fail visibly.
- [ ] Parser/tool validation errors are observable to the service/router.

## Implementation notes

- Do not let this ticket drift into orchestration or inbox creation.
- Prefer explicit tools over free-form instructions when the runtime supports them.
- Keep a bounded XML/JSON decision fallback for the first version if direct tool calls are not ready.

## How to test

1. Unit test valid controller tool requests.
2. Unit test valid controller run summaries.
3. Unit test malformed output and missing summary.
4. Verify forbidden actions are rejected by validation.
5. Verify generated plans can express a linear dependency chain.
6. Verify prompts include the service-layer boundary clearly.
