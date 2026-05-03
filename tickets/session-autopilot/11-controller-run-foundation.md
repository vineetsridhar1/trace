# 11 — Controller Run Foundation

## Summary

Add durable controller-run sessions for project orchestration.

## What needs to happen

- Add `ProjectControllerRun`.
- Add `SessionRole.project_controller_run`.
- Create controller-run sessions as normal Trace sessions.
- Store:
  - trigger type
  - trigger event
  - linked session
  - status
  - summary title
  - summary text
  - structured summary payload
  - error state
- Emit controller-run lifecycle events in the project scope.
- Hide controller-run sessions from normal tab strips by default.
- Link full controller transcripts from explicit project activity/debug surfaces.

## Deliverable

The orchestrator can create inspectable, episodic controller sessions attached to a project run.

## Completion requirements

- [ ] Controller-run rows can be created and completed.
- [ ] Controller-run sessions use a distinct role.
- [ ] Controller runs emit project-scoped lifecycle events.
- [ ] Structured summaries are required on successful completion.
- [ ] Controller-run transcripts can be opened from the project UI.
- [ ] Normal session lists do not become noisy.

## Implementation notes

- The orchestrator is durable service state, not the controller session.
- Do not create one permanent controller session.
- Keep summaries concise and machine-readable.

## How to test

1. Create a controller run for a project run.
2. Verify a session is linked.
3. Complete the run with a summary.
4. Verify project activity shows the summary and transcript link.
