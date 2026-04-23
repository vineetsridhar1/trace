# 16 — Playbook Expansion and Debug Follow-ups

## Summary

Post-v1 follow-up work: richer playbooks, a debug-oriented controller view, and future mobile surfaces.

## What needs to happen

- Add more built-in playbooks beyond `qa_first`.
- Add a debug panel or drill-down for hidden controller activity.
- Consider exposing controller transcript/history for power users.
- Add mobile follow-up surfaces once inbox support exists there.
- Revisit whether XML should be replaced by a stronger decision contract.

## Dependencies

- [15 — Telemetry, Error States, and Polish](15-telemetry-error-states-and-polish.md)

## Completion requirements

- [ ] Additional playbooks are product-approved and do not regress the default loop.
- [ ] A debug surface exists for inspecting controller decisions.
- [ ] Mobile follow-up work is scoped separately from v1.

## Implementation notes

- Keep this explicitly out of v1 unless the core loop is already solid.
- Product and engineering should review telemetry from ticket 15 before expanding behavior.

## How to test

1. Add a second playbook and verify the controller prompt changes only in the intended playbook block.
2. Use the debug surface to inspect controller decisions for a real session group.
3. Verify default v1 behavior remains unchanged when no extra playbook is selected.
