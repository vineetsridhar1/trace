# 11 — Tier 2 Planner

## Summary

The planner is where the LLM decides what to do. It receives a context packet and produces a structured decision: ignore, suggest, act, summarize, or escalate. Tier 2 uses a workhorse model (Sonnet/Haiku-class) and handles the vast majority of decisions.

## What needs to happen

- Create `apps/server/src/agent/planner.ts`
- The planner receives a context packet and returns a structured `PlannerOutput`:
  ```
  {
    disposition: "ignore" | "suggest" | "act" | "summarize" | "escalate",
    confidence: number (0-1),
    rationaleSummary: string,
    proposedActions: [{ actionType: string, args: Record<string, unknown> }],
    userVisibleMessage?: string,
    promotionReason?: string
  }
  ```
- Build the system prompt from the context packet:
  1. System preamble (role, constraints, output format)
  2. Action schema (from the registry — what the agent can do)
  3. Soul file (from org settings)
  4. Context packet (serialized: trigger event, batch, scope entity, relevant entities, summaries)
  5. Output schema (strict JSON format)
- The system prompt must heavily emphasize:
  - `no_op` / `ignore` is a valid and common output — most events require no action
  - Only act when confidence is high
  - Never invent action names — pick from the provided set
  - Be concise in `userVisibleMessage`
- Use the Anthropic SDK to call the model with structured output (tool use or JSON mode)
- The planner should use `OrgAgentSettings.modelTier` to select the model (defaulting to Sonnet-class)
- If the planner outputs a `promotionReason`, return it so the caller can re-run with Tier 3 later (ticket 16)
- Record token usage (input + output) and latency for the execution log

## Dependencies

- 06 (Action Registry — provides action schema for the prompt)
  <!-- Ticket 06 created: Use `getActionsByScope(scope)` from `./agent/action-registry.js` to get available actions. Build the action schema section of the prompt from `AgentActionRegistration.name`, `.description`, and `.parameters.fields`. The `parameters.fields` record maps field names to `{ type, description, required?, enum? }` — serialize these as the tool/action schema the LLM picks from. `no_op` is always available in all scopes. -->
- 10 (Context Builder — provides the context packet)
  <!-- Ticket 10 created: Import `buildContext` and `AgentContextPacket` from `./agent/context-builder.js`. Call `buildContext({ batch, agentSettings })` where `batch: AggregatedBatch` and `agentSettings: OrgAgentSettings`. The returned `AgentContextPacket` has: `triggerEvent` (AgentEvent), `eventBatch` (AgentEvent[]), `soulFile` (string), `scopeEntity` (ContextEntity | null with .type, .id, .data, .hop), `relevantEntities` (ContextEntity[]), `recentEvents` (AgentEvent[]), `summaries` (ContextSummary[] with .content, .structuredData, .fresh, .eventCount), `actors` (ContextActor[] with .id, .name, .role, .type), `permissions` ({ autonomyMode: string, actions: AgentActionRegistration[] }), `tokenBudget` ({ total, used, sections }). The planner should serialize the packet sections into the prompt in this order: action schema → soul file → scope entity → trigger event → event batch → relevant entities → summaries → recent events → actors. Use `tokenBudget.sections` to decide truncation if the serialized prompt exceeds model limits. -->

## Completion requirements

- [x] Planner module exists and calls an LLM with a structured prompt
- [x] Output is parsed into a typed `PlannerOutput` structure
- [x] Invalid LLM outputs (wrong action names, malformed JSON) are handled gracefully — default to `ignore`
- [x] Token usage and latency are tracked and returned alongside the decision
- [x] The system prompt includes the action schema, soul file, and full context
- [x] `no_op`/`ignore` is the default behavior for ambiguous situations
- [x] The prompt is constructed so adding new action types or scope types doesn't require prompt rewrites

## How to test

1. Feed a context packet with a clear bug report in a chat thread — verify the planner suggests `ticket.create`
2. Feed a context packet with casual conversation — verify the planner returns `ignore`
3. Feed a context packet where a matching ticket already exists in relevant entities — verify the planner suggests `message.send` (reply referencing the ticket) instead of creating a duplicate
4. Feed a malformed context packet — verify the planner defaults to `ignore`, not crash
5. Verify token counts and latency are returned in the result
