# 02 - GraphQL Schema and Client Types

## Summary

Expose agent environments through GraphQL while keeping resolvers thin wrappers over the service layer.

## What needs to happen

- Add `AgentEnvironmentAdapterType` with:
  - `local`
  - `provisioned`
- Add `AgentEnvironment` GraphQL type.
- Add `AgentEnvironmentTestResult`.
- Add inputs:
  - `CreateAgentEnvironmentInput`
  - `UpdateAgentEnvironmentInput`
- Add query:
  - `agentEnvironments(orgId: ID!): [AgentEnvironment!]!`
- Add mutations:
  - `createAgentEnvironment`
  - `updateAgentEnvironment`
  - `deleteAgentEnvironment`
  - `testAgentEnvironment`
- Add `environmentId` to session creation input.
- Preserve existing `hosting` and `runtimeInstanceId` inputs temporarily for compatibility.
- Run GraphQL codegen.

## Dependencies

- [01 - Database Schema and Event Types](01-database-schema-and-event-types.md)

## Completion requirements

- [ ] Schema compiles from `packages/gql/src/schema.graphql`.
- [ ] Shared generated types include `AgentEnvironment`.
- [ ] Server resolver types include the new query/mutations.
- [ ] Session creation accepts `environmentId`.
- [ ] Existing clients using `hosting` and `runtimeInstanceId` still compile.

## Implementation notes

- Do not duplicate generated types outside `@trace/gql`.
- Keep `config` as `JSON`; adapter-specific validation belongs in services/adapters.
- Resolvers should only parse input, call services, and format output.

## How to test

1. Run `pnpm gql:codegen`.
2. Run the server typecheck/build target used by the repo.
3. Execute a local GraphQL query for org environments.
4. Execute a local mutation using both `local` and `provisioned` adapter types.
