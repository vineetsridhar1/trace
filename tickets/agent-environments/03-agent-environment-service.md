# 03 - Agent Environment Service

## Summary

Create the service-layer owner for environment CRUD, default resolution, validation, authorization, and event emission.

## Plan coverage

Owns plan lines:

- 119-135: service-layer position in the target architecture
- 137-163: transactional default-environment enforcement
- 293-340: `AgentEnvironmentService` responsibilities, methods, and thin resolvers
- 910-937: service-layer secret resolution
- 941-948: phase 1 service/resolver/events work
- 1056 and 1059: V1 environment service and default environment requirements

## What needs to happen

- Add `agentEnvironmentService`.
- Implement methods for:
  - create
  - update
  - delete or disable
  - list by org
  - resolve by id for session creation
  - resolve org default
  - set default
  - test environment
- Enforce organization authorization for all reads and writes.
- Validate `adapterType`.
- Validate config through the matching runtime adapter.
- Validate V1 compatibility constraints when present:
  - supported tools
  - startup timeout
- Ensure only one default environment exists per org.
- Emit `agent_environment.*` events from the service layer.
- Add thin GraphQL resolvers that call this service.

## Dependencies

- [01 - Database Schema and Event Types](01-database-schema-and-event-types.md)
- [02 - GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)

## Completion requirements

- [ ] Environment CRUD works through the service layer.
- [ ] Unauthorized callers cannot read or mutate environments.
- [ ] Default environment changes are transactional.
- [ ] Invalid configs are rejected before persistence.
- [ ] Invalid environment compatibility constraints are rejected before persistence.
- [ ] Service emits environment lifecycle events.
- [ ] Resolvers contain no business logic.

## Implementation notes

- Config validation should be adapter-owned, but service-owned orchestration should decide when validation runs.
- Disable should be preferred over hard delete if existing sessions reference the environment.
- If deleting is allowed, reject deletion while active sessions still depend on the environment.

## How to test

1. Create a local environment through GraphQL.
2. Create a provisioned environment through GraphQL.
3. Set each as default and verify the previous default is cleared.
4. Try to mutate an environment from another org and verify it fails.
5. Verify an environment-created event is appended.
