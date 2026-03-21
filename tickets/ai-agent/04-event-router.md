# 04 — Event Router

## Summary

The event router is the first stage of the agent pipeline. It processes every event the worker consumes and makes a cheap, deterministic decision: drop, forward to aggregator, or send directly to the planner. No LLM calls — this is pure code.

## What needs to happen

- Create `apps/server/src/agent/router.ts`
- The router receives a deserialized event and the org's `OrgAgentSettings` (from `AgentIdentityService`), and returns a routing decision: `drop`, `aggregate`, or `direct`
  <!-- Ticket 03 created `OrgAgentSettings` with fields: agentId, organizationId, name, status, autonomyMode, soulFile, costBudget.dailyLimitCents -->
- Implement these routing rules:
  - **Drop** if org AI is disabled (`agentSettings.status === "disabled"` — ticket 03 collapsed `aiEnabled` into the `AgentIdentity.status` field)
  - **Drop** if `actorId` matches the agent's own ID (self-trigger suppression) — with an explicit allowlist for cases where the agent should still observe its own events (e.g., monitoring a session the agent itself started). The allowlist should be a simple set of event types + scope type combinations
  - **Drop** for low-value events (e.g. `inbox_item_created`, `inbox_item_resolved` from system actor)
  - **Direct** (bypass aggregation) for: `ticket.assigned` where assignee is the agent, `session_terminated`/`session_paused` with `needs_input`, explicit @mention of the agent in a message
  - **Aggregate** for: `message_sent`, `message_edited`, `ticket_created`, `ticket_updated`, `ticket_commented`, `session_output`
  - **Drop** everything else by default (conservative — new event types must be explicitly opted in)
- Implement rate limiting per scope: if a scope has emitted more than N events in the last T seconds, coalesce instead of forwarding each one
- Maintain an in-memory set of chat IDs where the agent is a member. Update this set when `chat_member_added` / `chat_member_removed` events arrive. Drop chat-scoped events where the agent is not a member
- The router should be designed so adding new scope types (like channel messages later) requires adding entries to the routing rules, not changing the router's structure
- Check the org's cost budget (via the cost tracker from ticket 08) and enforce four degradation tiers:
  - Budget > 50% remaining: normal operation
  - Budget 10-50% remaining: suppress Tier 3 promotions (annotate events as Tier 2 only)
  - Budget < 10% remaining: observe-only mode (only allow silent enrichment like summaries, drop all suggestions and actions)
  - Budget exhausted: drop all events (log only)
- Log routing decisions for observability

## Dependencies

- 02 (Agent Worker Process)
- 03 (Agent Identity)

## Completion requirements

- [ ] Router module exists and is called by the agent worker for every consumed event
- [ ] Self-trigger suppression works (agent's own events are dropped)
- [ ] Org AI disabled check works
- [ ] Chat membership gate works (chat events dropped if agent not a member)
- [ ] Rate limiting per scope is implemented
- [ ] Cost budget degradation tiers are enforced (normal → suppress Tier 3 → observe-only → drop all)
- [ ] Routing decisions are logged
- [ ] Adding a new event type to routing is a one-line change

## How to test

1. Set `AgentIdentity.status` to `disabled` for an org (via `updateAgentSettings` mutation) — verify all events for that org are dropped
2. Have the agent create an event (manually simulate) — verify it's dropped as self-trigger
3. Send a message in a chat where the agent is NOT a member — verify it's dropped
4. Add the agent to a chat, send a message — verify it's forwarded
5. Check logs — routing decisions should show event type, scope, and decision
