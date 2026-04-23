# 09 — Controller Prompt and Decision Parser

## Summary

Define the controller contract and make it parseable. The controller needs a stable prompt and the server needs a strict parser so the review loop stays deterministic.

## What needs to happen

- Author the base controller prompt.
- Encode the decision contract as strict XML with exactly three actions:
  - `continue_worker`
  - `request_human_validation`
  - `stop`
- Implement a parser that:
  - validates action values
  - extracts summary
  - extracts worker follow-up message
  - extracts QA checklist items
- Fail safe when the output is malformed.

## Dependencies

- [08 — Autopilot Context Packet Builder](08-autopilot-context-packet-builder.md)

## Completion requirements

- [ ] Prompt contract is stable and checked into the repo.
- [ ] Valid controller output parses into a typed decision object.
- [ ] Malformed output does not result in speculative actions.
- [ ] Parser errors are observable to the service/orchestrator.

## Implementation notes

- Do not let this ticket drift into orchestration or inbox creation.
- The parser should accept only the contract we define, not "best effort" guesses.

## How to test

1. Parse a valid `continue_worker` sample.
2. Parse a valid `request_human_validation` sample.
3. Parse a valid `stop` sample.
4. Verify malformed XML and unknown actions fail safely.

