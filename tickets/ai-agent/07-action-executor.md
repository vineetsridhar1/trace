# 07 — Action Executor

## Summary

The executor is the only place where the agent runtime mutates product state. It takes a planned action (name + args), looks it up in the action registry, and calls the corresponding service method with the agent's identity. Every action goes through the existing service layer — the executor never writes to the DB directly.

## What needs to happen

- Create `apps/server/src/agent/executor.ts`
- The executor receives:
  - A planned action (`{ actionType: string, args: Record<string, unknown> }`)
  - Agent context (`{ organizationId, agentId }`)
- It resolves the action from the registry, injects `organizationId`, `actorType: "agent"`, and `actorId` into the args, and calls the mapped service method
- Implement idempotency: build an idempotency key from `agent:{agentId}:{actionName}:{triggerEventId}`. Check if this key has been used before executing. Store used keys (Redis with TTL or a DB table)
- Handle errors gracefully — catch service exceptions and return a structured result (`{ status: "success" | "failed", result?, error? }`)
- Reject unknown action names
- For `no_op`, return success immediately without calling any service
- The executor must accept a service container at construction (dependency injection) so it calls the same service instances the API server uses

## Dependencies

- 06 (Action Registry)
  <!-- Ticket 06 created: `AgentActionRegistration` interface with `name`, `service`, `method`, `description`, `risk: RiskLevel`, `suggestable`, `parameters: ParameterSchema`, `scopes: ScopeType[]`, `requiredPermissions?`. Query functions: `getAllActions()`, `getActionsByScope(scope)`, `findAction(name)`, `validateActionParams(action, params)`. Import from `./agent/action-registry.js`. Implementation notes for executor: (1) `ticket.update` has `id` in params — destructure it out and pass as first positional arg to `ticketService.update(id, input, actorType, actorId)`. Same for `ticket.addComment(ticketId, text, actorType, actorId)`. (2) `escalate.toHuman` maps to `inboxService.createItem` — executor must inject `orgId` and `itemType: "agent_escalation"` since they're not in the LLM-facing schema. (3) `summary.update` references `summaryService` which doesn't exist until ticket #09 — handle gracefully (skip or error). (4) `session.start` needs `organizationId` and `createdById` injected from agent context. (5) `session.pause/resume` take positional args `(id, actorType, actorId)`, not an object. -->

## Completion requirements

- [x] Executor module exists and can execute any registered action
- [x] Actions are routed to the correct service method
- [x] Agent identity is injected into every service call
- [x] Idempotency prevents duplicate execution for the same trigger event
- [x] Unknown actions are rejected with a clear error
- [x] `no_op` is handled without side effects
- [x] Errors from service calls are caught and returned, not thrown

## How to test

1. Execute `ticket.create` with valid args — verify a ticket is created with `actorType: "agent"`
2. Execute the same action with the same trigger event ID — verify idempotency prevents a duplicate
3. Execute `no_op` — verify it returns success with no side effects
4. Execute an unknown action name — verify it returns an error
5. Execute an action with invalid args — verify the service validation catches it and the executor returns a failure result
