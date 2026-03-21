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

## Completion requirements

- [ ] Executor module exists and can execute any registered action
- [ ] Actions are routed to the correct service method
- [ ] Agent identity is injected into every service call
- [ ] Idempotency prevents duplicate execution for the same trigger event
- [ ] Unknown actions are rejected with a clear error
- [ ] `no_op` is handled without side effects
- [ ] Errors from service calls are caught and returned, not thrown

## How to test

1. Execute `ticket.create` with valid args — verify a ticket is created with `actorType: "agent"`
2. Execute the same action with the same trigger event ID — verify idempotency prevents a duplicate
3. Execute `no_op` — verify it returns success with no side effects
4. Execute an unknown action name — verify it returns an error
5. Execute an action with invalid args — verify the service validation catches it and the executor returns a failure result
