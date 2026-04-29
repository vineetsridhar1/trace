# 16 — Controller Debugging and Playbook Expansion

## Summary

Post-v1 follow-up for richer controller-run inspection, additional orchestration playbooks, future DAG scheduling, and mobile surfaces after the core Ultraplan loop is stable.

## What needs to happen

- Add more built-in playbooks beyond the default ordered-ticket implementation flow.
- Add a debug panel or drill-down for controller run activity.
- Expose the full controller run transcript/log for power users through an Ultraplan inspector.
- Reuse existing session transcript/log components where possible.
- Add controller decision summaries to ticket execution detail surfaces.
- Keep controller-run inspection behind explicit Ultraplan entry points.
- Add future DAG scheduling and parallel worker playbooks once sequential v1 is proven.
- Add mobile follow-up surfaces once inbox and session-group support are ready there.
- Revisit whether structured XML/JSON fallback should be replaced by direct tool calls everywhere.

## Dependencies

- [15 — Integration, Telemetry, and Polish](15-telemetry-error-states-and-polish.md)

## Completion requirements

- [ ] Additional playbooks are product-approved and do not regress the default flow.
- [ ] A debug surface exists for inspecting controller run decisions.
- [ ] The full controller run log/transcript can be opened from Ultraplan surfaces.
- [ ] Normal session lists and tab strips still hide controller-run sessions.
- [ ] Future DAG/parallel execution is scoped separately from v1.
- [ ] Mobile follow-up work is scoped separately from v1 if not ready.

## Implementation notes

- Keep this explicitly out of v1 unless the core loop is already solid.
- Product and engineering should review telemetry from ticket 15 before expanding behavior.
- Because each controller run is a real session, prefer reused session transcript components over inventing a second log model.

## How to test

1. Open the controller-run inspector from an Ultraplan surface.
2. Verify controller-run sessions remain hidden in normal navigation.
3. Verify additional playbooks still use the same service-layer and event model.
4. Verify DAG/parallel behavior is gated behind a post-v1 playbook.
5. Verify mobile surfaces are either implemented or explicitly gated off.
