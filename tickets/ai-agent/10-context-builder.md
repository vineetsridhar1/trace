# 10 — Context Builder

## Summary

The context builder converts a raw event batch into a compact, relevant context packet for the planner. It's the most important subsystem after the service layer — the planner is only as good as what the context builder feeds it. This is a retrieval step, not a data dump.

## What needs to happen

- Create `apps/server/src/agent/context-builder.ts`
- The context builder receives a closed aggregation window (batch of events + scope key + org) and produces a structured `AgentContextPacket`

### Context packet structure

The packet should include:
- **Trigger event** — the most recent event in the batch
- **Event batch** — all events in the window
- **Soul file** — resolved from org agent settings (empty string is fine for now until ticket 13)
- **Scope entity** — the entity where the event happened (chat, ticket, session). Fetched via the appropriate service
- **Relevant entities** — entities found via targeted search, NOT a dump of everything. For ticket-related discussions, search tickets by keyword similarity. Limit to 5 results max. Use bounded graph traversal: Hop 0 is the scope entity (full budget), Hop 1 is directly linked entities (60% of linked-entity budget), Hop 2 is entities linked to Hop 1 (40% of linked-entity budget). No Hop 3 — if deeper context is needed, summaries should cover it
- **Recent events** — additional recent events in the same scope beyond the batch, for broader context
- **Summaries** — rolling summaries for the scope entity and relevant linked entities
- **Actors** — names/roles of users involved in the batch
- **Permissions** — the org's autonomy mode and the list of available actions from the registry (filtered by scope)

### Token budget management

- Define a token budget config with per-section allocations (trigger event, batch, soul file, scope entity, relevant entities, recent events, summaries, actors, action schema)
- Fill the packet greedily by priority — trigger event and action schema first, then scope entity, then batch, then relevant entities, summaries, recent events
- If a section exceeds its budget, truncate: events from oldest, entities from least relevant, summaries from least related scope
- Use a simple token estimation function (words * 1.3 or similar) — exact tokenization isn't necessary

### Relevant entity search

- For ticket-related context: use Postgres full-text search or `ILIKE` against ticket titles/descriptions to find potentially related tickets. This replaces dumping all tickets into context
- Add a `searchByRelevance` method to the ticket service that takes search text and returns top N matches
- For session/chat context: follow explicit links (ticket → session, chat → mentioned ticket IDs) rather than searching

### Project and repo context

- When the scope entity belongs to a project, include the project metadata in the context (for scoping retrieval and understanding initiative context)
- When a session is linked to a repo, include repo metadata (for code ownership context)
- These are Hop 1 entities — follow the link budget allocation

### Scope type abstraction

- The context builder should handle scope types via a strategy pattern or switch, so adding a new scope type (like channels) means adding a case, not restructuring the builder

## Dependencies

- 05 (Event Aggregator — provides the batches)
  <!-- Ticket 05 created: `AggregatedBatch` type (scopeKey, organizationId, events: AgentEvent[], maxTier?, openedAt, closedAt, closeReason). `buildScopeKey(event)` constructs keys like `chat:{id}:thread:{parentId}`, `chat:{id}`, `ticket:{id}`, `session:{id}`, generic `{type}:{id}`. Import `AggregatedBatch` and `buildScopeKey` from `./agent/aggregator.js`. The batch handler in agent-worker.ts is where the context builder will be wired in — replace the current log-only `handleBatch()` function. -->
- 06 (Action Registry — provides available actions)
- 09 (Entity Summaries — provides summaries)

## Completion requirements

- [ ] Context builder module exists and produces structured context packets
- [ ] Token budget management is implemented with priority-based filling
- [ ] Relevant entities are found via search, not bulk loading
- [ ] Ticket search by relevance is implemented
- [ ] Summaries are included with freshness status
- [ ] Actor information is resolved from user IDs
- [ ] The packet includes the available action list filtered by scope
- [ ] Adding a new scope type is a localized change

## How to test

1. Create a batch of chat messages discussing a bug, with an existing ticket whose title matches — verify the context packet includes that ticket as a relevant entity
2. Create a batch in a scope with 1000 tickets — verify only 5 (or fewer) relevant tickets appear, not all of them
3. Verify token budget is respected — sections are truncated when they exceed allocation
4. Create a batch in a ticket scope — verify the linked session and chat are included via link traversal
5. Verify the action list in the packet only includes actions valid for the given scope type
