# 15 — End-to-End Pipeline Integration

## Summary

Wire everything together. The individual components exist (router, aggregator, context builder, planner, policy engine, executor, suggestion delivery) — this ticket connects them into a single pipeline that runs in the agent worker.

## What needs to happen

- Create `apps/server/src/agent/pipeline.ts` — the orchestrator that chains the components together
- The pipeline for each event batch should follow this sequence:
  1. **Context builder** assembles the context packet from the batch
  2. **Planner** receives the packet and returns a decision
  3. **Policy engine** evaluates each proposed action
  4. For `execute` decisions → **executor** runs the action
  5. For `suggest` decisions → **suggestion creator** makes an InboxItem
  6. For `drop` decisions → log and discard
  7. **Execution logger** records the full decision chain (context token allocation, planner output, policy decision, final action, latency, cost)
  8. **Cost tracker** updates the org's daily spend
- Wire this pipeline into the agent worker's event consumption loop:
  - Worker consumes event → router decides → if aggregate: aggregator batches → when window closes: pipeline runs on the batch
  - If direct: pipeline runs immediately on a single-event batch
- Handle errors at each stage — if the planner fails, log it and move on. If the executor fails, log the failure. Never let one bad event crash the pipeline
- Add structured logging throughout so the full decision chain is traceable

## Dependencies

- All previous tickets (04-14)

## Completion requirements

- [ ] Pipeline module exists and chains all components
- [ ] Agent worker runs the full pipeline for every event batch
- [ ] Each stage's output feeds into the next stage
- [ ] Execution logs capture the full decision chain
- [ ] Cost tracking is updated after each planner call
- [ ] Errors in any stage are caught, logged, and don't crash the worker
- [ ] The pipeline processes events from all scope types that the router forwards

## How to test

This is the big integration test. Run through these scenarios end-to-end:

1. **Chat message about a bug** → agent is a member of the chat → router forwards → aggregator batches → context builder finds a matching ticket → planner suggests linking → policy routes to suggest → InboxItem appears for the user
2. **Casual chat message** → router forwards → aggregator batches → planner returns ignore → nothing happens
3. **Message in a chat where agent is not a member** → router drops → nothing happens
4. **Ticket assigned to agent** → router sends direct → planner decides to act → executor runs the action → execution log captures everything
5. **Org AI disabled** → router drops everything → nothing happens
6. **20 rapid messages in a scope** → aggregator batches them → single planner call for the batch → verify only one LLM call, not 20
7. Check execution logs after all scenarios — verify full decision chains are recorded with token counts and costs
