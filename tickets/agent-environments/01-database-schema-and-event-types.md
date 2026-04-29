# 01 - Database Schema and Event Types

## Summary

Add the durable database and event contracts for org-configured agent environments and runtime lifecycle state.

## What needs to happen

- Add an `AgentEnvironment` Prisma model with:
  - `id`
  - `orgId`
  - `name`
  - `adapterType`
  - `config`
  - `enabled`
  - `isDefault`
  - timestamps
- Add indexes for `orgId` and `orgId + adapterType`.
- Enforce one enabled default environment per org transactionally in the service layer if the database cannot express the partial unique constraint cleanly.
- Normalize the existing `Session.connection` shape to include:
  - `environmentId`
  - `adapterType`
  - `runtimeInstanceId`
  - `runtimeLabel`
  - `providerRuntimeId`
  - lifecycle timestamps
  - retry/move flags
- Add or normalize event types for:
  - `agent_environment.created`
  - `agent_environment.updated`
  - `agent_environment.deleted`
  - `session.runtime_start_requested`
  - `session.runtime_provisioning`
  - `session.runtime_connecting`
  - `session.runtime_connected`
  - `session.runtime_start_failed`
  - `session.runtime_start_timed_out`
  - `session.runtime_stopping`
  - `session.runtime_stopped`
  - `session.runtime_deprovision_failed`
  - `session.runtime_disconnected`
  - `session.runtime_reconnected`
- Add or reuse an org secret model/service if no suitable org secret storage exists.
- Run migration and Prisma generate.

## Dependencies

- None

## Completion requirements

- [ ] `AgentEnvironment` is org-scoped and persisted.
- [ ] Existing sessions can continue to read their current `connection` JSON.
- [ ] New runtime lifecycle event types are available server-side and in generated types.
- [ ] One default environment per org is enforced.
- [ ] Raw provider tokens are not stored in `AgentEnvironment.config`.
- [ ] Migration runs cleanly on an existing local database.

## Implementation notes

- Keep `adapterType` limited to `local` and `provisioned` for V1.
- Do not add provider-specific columns such as Fly app name or ECS cluster ARN.
- Keep provider details in opaque config JSON and event metadata.
- Defer a dedicated `SessionRuntime` table to ticket 15 unless `Session.connection` becomes unsafe to evolve.

## How to test

1. Run `pnpm db:migrate`.
2. Run `pnpm db:generate`.
3. Create two environments for one org and verify only one can be default.
4. Verify existing sessions still load with their old connection payloads.
5. Verify new event enum/type generation includes the runtime lifecycle events.
