# 16 — Controller Debugging and Playbook Expansion

## Summary

Post-v1 follow-up for richer controller inspection, additional orchestration playbooks, and mobile surfaces after the core Ultraplan loop is stable.

## What needs to happen

- Add more built-in playbooks beyond the default ticket-graph implementation flow.
- Add a debug panel or drill-down for controller activity.
- Expose the full controller transcript/log for power users through an Ultraplan inspector.
- Reuse existing session transcript/log components where possible.
- Add controller decision summaries to ticket execution detail surfaces.
- Keep controller-session inspection behind explicit Ultraplan entry points.
- Add mobile follow-up surfaces once inbox and session-group support are ready there.
- Revisit whether structured XML/JSON fallback should be replaced by direct tool calls everywhere.

## Dependencies

- [15 — Integration, Telemetry, and Polish](15-telemetry-error-states-and-polish.md)

## Completion requirements

- [ ] Additional playbooks are product-approved and do not regress the default flow.
- [ ] A debug surface exists for inspecting controller decisions.
- [ ] The full controller log/transcript can be opened from Ultraplan surfaces.
- [ ] Normal session lists and tab strips still hide controller sessions.
- [ ] Mobile follow-up work is scoped separately from v1 if not ready.

## Implementation notes

- Keep this explicitly out of v1 unless the core loop is already solid.
- Product and engineering should review telemetry from ticket 15 before expanding behavior.
- Because the controller is a real session, prefer reused session transcript components over inventing a second log model.

## How to test

1. Open the controller inspector from an Ultraplan surface.
2. Verify controller sessions remain hidden in normal navigation.
3. Verify additional playbooks still use the same service-layer and event model.
4. Verify mobile surfaces are either implemented or explicitly gated off.
