# 15 — Telemetry, Error States, and Polish

## Summary

Finish the feature with observability, user-visible error handling, timeline polish, and rollout-safe behavior.

## What needs to happen

- Emit metrics for:
  - enabled/disabled
  - reviews started/succeeded/failed
  - decision types
  - validation handoffs created/resolved/dismissed
- Emit performance signals for:
  - context packet size / truncation rate
  - controller review latency
  - follow-up delivery latency
- Surface Autopilot error state cleanly in the session UI.
- Add simple timeline/history entries for Autopilot actions.
- Review rollout behavior when the feature is only partially configured or partially failing.
- Verify the feature degrades safely when permission, runtime, or bridge assumptions fail.
- Make sure all Autopilot-related codepaths are covered by tests.

## Dependencies

- [05 — Header Controls and Settings UI](05-header-controls-and-settings-ui.md)
- [11 — Continue-Worker Execution](11-continue-worker-execution.md)
- [12 — Human Validation Handoff (Server)](12-human-validation-handoff-server.md)
- [13 — Human Validation Inbox UI](13-human-validation-inbox-web-ui.md)
- [14 — Guardrails, Pause, and Cooldowns](14-guardrails-pause-and-cooldowns.md)

## Completion requirements

- [ ] Metrics exist for major Autopilot lifecycle events.
- [ ] Performance counters exist for packet size/truncation and review latency.
- [ ] User-visible error states are understandable and recoverable.
- [ ] Session history shows Autopilot actions at a high level.
- [ ] Feature behaves safely when controller creation or review fails.
- [ ] Permission/runtime failures degrade into clear `error` or `paused` states.

## Implementation notes

- Keep the first version of timeline/history lightweight; event-driven rendering is enough.
- This ticket is where rollout safety matters: partial failure should degrade into `error` or `paused`, never corrupt the worker session.
- Do not turn this into a full analytics project. Keep the counters directly tied to the success metrics in the plan.

## How to test

1. Trigger a successful review and verify metrics fire.
2. Trigger a controller or delivery failure and verify UI error state.
3. Verify Autopilot history entries appear in the session timeline.
4. Validate rollout behavior with Autopilot disabled, enabled, paused, and error states.
5. Force permission or runtime-selection failures and verify safe degradation plus metric emission.
