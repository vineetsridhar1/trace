# 12 — Policy Engine

## Summary

The policy engine sits between the planner and the executor. It takes the planner's decision and routes it based on the action's risk level, the planner's confidence score, and the scope's autonomy mode. It decides: execute the action, create a suggestion, or drop it.

## What needs to happen

- Create `apps/server/src/agent/policy-engine.ts`
- The policy engine receives:
  - The planner output (disposition, confidence, proposed actions)
  - The agent context (org settings, autonomy mode, scope)
  - Action registrations (risk level, suggestable flag)
- For each proposed action, return a policy decision: `execute`, `suggest`, or `drop`

### Confidence-based routing matrix

Use configurable thresholds based on risk × autonomy mode:

| Risk | Mode: suggest | Mode: act |
|------|--------------|-----------|
| low | suggest ≥ 0.3, act ≥ 0.6 | suggest ≥ 0.2, act ≥ 0.4 |
| medium | suggest ≥ 0.5, act ≥ 0.9 | suggest ≥ 0.3, act ≥ 0.7 |
| high | suggest ≥ 0.6, act ≥ 0.95 | suggest ≥ 0.5, act ≥ 0.85 |

### Hard rules

- If autonomy mode is `observe`: always drop (no suggestions, no actions — only silent enrichment like summaries)
- If the action is not in the registry: drop
- If the action's risk is `blocked`: drop
- If the action is not `suggestable` and confidence is below act threshold: drop (can't suggest it, can't act on it)

### Anti-chaos mechanisms

- Rate limit: no more than N suggestions per scope per hour (default: 2 for channels, 1 for group chats, 0 unsolicited for DMs)
- Cooldown: if a user dismissed a suggestion of the same type in the same scope within the last 24 hours, suppress
- Check the org's cost budget — if exhausted, drop everything except observe-mode behaviors

## Dependencies

- 06 (Action Registry — risk levels)
  <!-- Ticket 06 created: Use `findAction(name)` from `./agent/action-registry.js` to look up action metadata. Use `.risk` (RiskLevel: "low" | "medium" | "high") for confidence threshold lookup, `.suggestable` to determine if an action can be downgraded to a suggestion, and `validateActionParams(action, params)` for input validation before execution. -->
- 08 (Execution Logging — cost budget check)

## Completion requirements

- [ ] Policy engine module exists and routes decisions correctly
- [ ] Confidence × risk × autonomy matrix is implemented
- [ ] Hard rules (observe mode, unknown actions, blocked actions) are enforced
- [ ] Per-scope rate limiting is implemented
- [ ] Dismissal cooldown suppression is implemented
- [ ] Cost budget enforcement is integrated
- [ ] Policy decisions are structured and loggable

## How to test

1. Planner returns `act` with confidence 0.8, risk `medium`, mode `suggest` — verify policy downgrades to `suggest` (0.8 < 0.9 act threshold)
2. Planner returns `act` with confidence 0.8, risk `medium`, mode `act` — verify policy allows `execute` (0.8 > 0.7 act threshold)
3. Autonomy mode is `observe` — verify all actions are dropped
4. Trigger 3 suggestions in the same scope within an hour — verify the 3rd is suppressed by rate limiting
5. Dismiss a ticket suggestion in a scope, then trigger a new one — verify cooldown suppresses it
