# 09 — Controller Prompt and Tool Contract

## Summary

Define how the Ultraplan controller session reasons and acts: its system prompt, allowed service-backed tools, and the structured response contract for v1.

## What needs to happen

- Author the base controller prompt.
- Make the controller's role explicit:
  - manage the ticket graph
  - launch or continue worker sessions
  - review completed/failed workers
  - request human gates
  - request integration of approved branches
- Define the initial tool surface:
  - `ticket.create`
  - `ticket.update`
  - `ticket.link`
  - `ultraplan.createTicketExecution`
  - `ultraplan.startWorker`
  - `ultraplan.sendWorkerMessage`
  - `ultraplan.requestHumanGate`
  - `ultraplan.markExecutionReady`
  - `ultraplan.markExecutionBlocked`
  - `integration.mergeTicketBranch`
  - `integration.rebaseTicketBranch`
  - `integration.reportConflict`
- Define a strict structured output fallback for runtimes that cannot call tools directly.
- Fail safe when controller output is malformed.

## Dependencies

- [08 — Ultraplan Context Packet Builder](08-autopilot-context-packet-builder.md)

## Completion requirements

- [ ] Prompt contract is checked into the repo.
- [ ] Tool contract is narrow and service-backed.
- [ ] Controller is instructed not to mutate DB/events/git directly.
- [ ] Malformed output does not result in speculative actions.
- [ ] Parser/tool validation errors are observable to the service/router.

## Implementation notes

- Do not let this ticket drift into orchestration or inbox creation.
- Prefer explicit tools over free-form instructions when the runtime supports them.
- Keep a bounded XML/JSON decision fallback for the first version if direct tool calls are not ready.

## How to test

1. Unit test valid controller decisions/tool requests.
2. Unit test malformed output.
3. Verify forbidden actions are rejected by validation.
4. Verify prompts include the service-layer boundary clearly.
