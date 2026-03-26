# 18 — Session Monitoring

## Summary

The ambient AI should watch coding sessions and provide useful oversight: summarize progress to linked tickets, detect when sessions are blocked, and notify relevant people. The ambient AI is not the coding tool — it's the orchestrator observing session lifecycle events.

## What needs to happen

### Session event handling

- The router should forward these session events: `session_started`, `session_paused`, `session_resumed`, `session_terminated`, `session_output`, `session_pr_opened`, `session_pr_merged`, `session_pr_closed`
- `session_terminated` with failure and `session_paused` with `needs_input` status should be routed as `direct` (bypass aggregation — these need prompt attention)
- `session_output` events should be aggregated (they come in bursts during active coding)

### Progress summaries

- When a session has a linked ticket, the agent should periodically update the ticket with a progress summary (via `ticket.addComment`)
- Use the entity summary system (ticket 09) to generate rolling session summaries
- Progress updates to tickets should be silent enrichment (low risk, act directly) rather than suggestions

### Blocked session handling

- When a session enters `needs_input` or fails, the agent should:
  - Check if there's a linked ticket and notify the assignee (via InboxItem or direct comment)
  - Include what the session was trying to do and where it got stuck
  - This should be a `direct` pipeline path — don't aggregate, respond quickly

### Session completion

- When a session completes or a PR is opened, summarize the outcome and post to the linked ticket
- Include key information: what was changed, test results, PR link

## Dependencies

- 15 (Pipeline Integration)
- 09 (Entity Summaries)

## Completion requirements

- [x] Session lifecycle events are routed correctly (direct for failures/blocked, aggregate for output bursts)
- [x] Rolling summaries are maintained for active sessions
- [x] Progress updates are posted to linked tickets
- [x] Blocked/failed sessions trigger notifications to relevant users
- [x] Session completion summaries are posted to linked tickets
- [x] All session monitoring actions go through the service layer with agent identity

## How to test

1. Start a session linked to a ticket — verify the agent begins tracking it
2. Generate several `session_output` events — verify they're aggregated and a rolling summary is maintained
3. Pause a session with `needs_input` — verify the ticket assignee gets notified quickly
4. Complete a session — verify a completion summary is posted to the linked ticket
5. Start a session with no linked ticket — verify the agent still tracks it but doesn't try to post comments to a nonexistent ticket
