# 22 — Agent Debug Console

## Summary

Build an internal UI for observing and debugging the agent pipeline. Without this, tuning the agent is blind. You need to see what events come in, how they're routed, what context the planner sees, what it decides, and what the policy engine does with that decision.

## What needs to happen

### Backend

- Add GraphQL queries for:
  - Recent execution logs (filterable by org, status, disposition, date range)
  - Execution log detail (full decision chain for a single run)
  - Cost tracking summary (daily/weekly spend per org, breakdown by tier)
  - Active aggregation windows (what's currently being batched)
  - Agent status (is the worker running, connected to Redis, consuming events)

### Frontend

- Add a debug/admin page (accessible to org admins) with:
  - **Event feed**: real-time stream of events the agent is processing, with routing decisions (drop/aggregate/direct)
  - **Execution log table**: recent planner runs with columns: timestamp, trigger scope, disposition, confidence, action, policy decision, status, cost, latency
  - **Execution detail view**: click into a log entry to see: the full context packet (what the planner saw), the planner output, the policy decision, the final action result
  - **Cost dashboard**: daily spend chart, breakdown by tier and action type, budget remaining
  - **Settings panel**: view/edit org agent settings (aiEnabled, autonomyMode, soul file, cost budget)

### Replay (stretch)

- Ability to replay a historical event through the planner to see what the agent would do with current settings/prompt — useful for prompt tuning

## Dependencies

- 08 (Execution Logging — data source)
  <!-- Ticket 08 created: Use `executionLoggingService.query({ organizationId, startDate?, endDate?, status?, agentId?, limit?, offset? })` for the execution log table. Use `executionLoggingService.getByTriggerEvent({ organizationId, triggerEventId })` for detail views. Use `costTrackingService.getByDateRange({ organizationId, startDate, endDate })` for the cost dashboard. Use `costTrackingService.checkBudget(orgId)` for the budget remaining display. All services are in `apps/server/src/services/`. -->
- 15 (Pipeline Integration — the pipeline must be producing logs)

## Completion requirements

- [ ] Execution logs are queryable via GraphQL
- [ ] Cost data is queryable via GraphQL
- [ ] Debug page exists in the web app with event feed, execution log, and cost dashboard
- [ ] Execution detail view shows the full decision chain
- [ ] Settings are viewable and editable from the debug page

## How to test

1. Trigger several agent decisions (send messages in chats, create tickets) — verify they appear in the execution log table
2. Click into an execution log entry — verify the full context packet and decision chain are visible
3. Check the cost dashboard — verify it shows accurate daily spend
4. Change the org autonomy mode from the settings panel — verify it takes effect on the next agent decision
5. Check the event feed — verify real-time events appear with their routing decisions
