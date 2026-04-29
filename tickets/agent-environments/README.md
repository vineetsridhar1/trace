# Agent Environments - Ticket Index

Tickets for replacing the prescriptive cloud-session model with org-configured agent environments. Work through milestones in order. See [agent-environments-plan.md](agent-environments-plan.md) for the full product and engineering spec.

## M0 - Contracts and Durable State

Define the org environment model, API contract, and service ownership before changing session routing.

| #   | Ticket                                                                                       | What it does                                                                 |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 01  | [Database Schema and Event Types](01-database-schema-and-event-types.md)                     | Adds `AgentEnvironment`, runtime connection fields, and lifecycle event types |
| 02  | [GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)                     | Adds environment queries/mutations and `environmentId` on session creation    |
| 03  | [Agent Environment Service](03-agent-environment-service.md)                                 | Adds service-layer CRUD, default selection, validation, and authorization      |

## M1 - Runtime Adapter Foundation

Wrap the existing runtime paths behind a generic local/provisioned adapter model.

| #   | Ticket                                                                                   | What it does                                                                    |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 04  | [Runtime Adapter Registry](04-runtime-adapter-registry.md)                               | Replaces hosting-mode branching with an environment-aware adapter registry       |
| 05  | [Local Environment Adapter](05-local-environment-adapter.md)                             | Keeps current desktop bridge behavior while representing local as an environment |
| 06  | [Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)                     | Adds signed start/stop/status lifecycle endpoint support                         |

## M2 - Cloud Runtime Readiness

Make provisioned runtimes connect back safely and handle slow startup without losing messages.

| #   | Ticket                                                                                         | What it does                                                            |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 07  | [Cloud Runtime Bridge Authentication](07-cloud-runtime-bridge-authentication.md)               | Adds short-lived runtime tokens and stricter cloud bridge registration  |
| 08  | [Startup Lifecycle and Pending Delivery](08-startup-lifecycle-and-pending-delivery.md)         | Tracks provisioning/connecting states and drains queued messages safely |
| 09  | [Deprovisioning and Runtime Reconciliation](09-deprovisioning-and-runtime-reconciliation.md)   | Adds adapter-owned stop/deprovision flow plus retry/reconcile behavior  |

## M3 - Product Surface and Migration

Expose environments in the product and migrate the current Fly/cloud assumptions out of core.

| #   | Ticket                                                                                         | What it does                                                         |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 10  | [Agent Environment Settings UI](10-agent-environment-settings-ui.md)                           | Adds org settings UI for local and provisioned environments          |
| 11  | [Session Environment Selection](11-session-environment-selection.md)                           | Lets session creation use org default or explicit environment        |
| 12  | [Cloud Compatibility and Fly Decoupling](12-cloud-compatibility-and-fly-decoupling.md)         | Migrates current cloud behavior to provisioned compatibility paths   |
| 13  | [Testing, Telemetry, and Rollout](13-testing-telemetry-and-rollout.md)                         | Adds coverage, status visibility, metrics, and rollout guardrails    |

## Post-V1 Follow-ups

Useful follow-ups that should not block the generic Trace-side architecture.

| #   | Ticket                                                                               | What it does                                                    |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 14  | [Reference Launchers](14-reference-launchers.md)                                     | Adds example AWS ECS/Fly/Kubernetes launchers outside core      |
| 15  | [Dedicated SessionRuntime Table](15-dedicated-session-runtime-table.md)              | Moves runtime lifecycle state out of `Session.connection` later |

## Dependency graph

```text
M0 - Contracts and Durable State
01 Database Schema and Event Types
-- 02 GraphQL Schema and Client Types
-- 03 Agent Environment Service  (needs 01, 02)

M1 - Runtime Adapter Foundation
04 Runtime Adapter Registry  (needs 01, 03)
-- 05 Local Environment Adapter  (needs 04)
-- 06 Provisioned Lifecycle Adapter  (needs 03, 04)

M2 - Cloud Runtime Readiness
07 Cloud Runtime Bridge Authentication  (needs 06)
-- 08 Startup Lifecycle and Pending Delivery  (needs 06, 07)
-- 09 Deprovisioning and Runtime Reconciliation  (needs 06, 08)

M3 - Product Surface and Migration
10 Agent Environment Settings UI  (needs 02, 03)
-- 11 Session Environment Selection  (needs 05, 06, 10)
-- 12 Cloud Compatibility and Fly Decoupling  (needs 06, 08, 09, 11)
-- 13 Testing, Telemetry, and Rollout  (needs 07, 08, 09, 10, 11, 12)

Post-V1
14 Reference Launchers  (needs 06, 07)
-- 15 Dedicated SessionRuntime Table  (needs 13)
```

## Parallelization notes

- Ticket 02 can run in parallel with the Prisma model from ticket 01 once field names are agreed.
- Tickets 05 and 06 can run in parallel after ticket 04 defines the adapter boundary.
- Ticket 10 can begin after ticket 02/03 land; it does not need cloud runtime auth from ticket 07.
- Tickets 08 and 09 should wait for the provisioned adapter and runtime token contract.
- Reference launchers should wait until the provisioned lifecycle payload is stable.

## Plan coverage map

- `## Goal`, `## Concepts`, and `## Target Architecture` are covered by tickets 01-06.
- `## Data Model` is owned by ticket 01, with the later `SessionRuntime` table deferred to ticket 15.
- `## GraphQL Schema` is owned by ticket 02.
- `## Service Layer` is owned by ticket 03 and integrated into session creation in ticket 11.
- `## Runtime Adapter Interface`, `## Adapter Registry`, `## Local Adapter`, and `## Provisioned Adapter` are covered by tickets 04-06.
- `## Runtime Bridge For Cloud` and `## Runtime Tokens` are covered by ticket 07.
- `## Startup Lifecycle` and `## Message Delivery During Startup` are covered by ticket 08.
- `## Deprovisioning` is covered by ticket 09.
- `## UI` is split across tickets 10 and 11.
- `## Secrets` is covered by tickets 01, 03, and 06.
- `## Migration Plan` is implemented across tickets 01-13, with ticket 12 owning Fly/cloud compatibility.
- `## Testing` is expanded in every ticket and consolidated by ticket 13.
- `## Open Decisions` remain explicit in ticket notes and should be resolved before implementation reaches the dependent ticket.
- `## Recommended V1 Scope` maps to tickets 01-13.

If the plan gains a new actionable requirement, add or update its owning ticket in the same change and keep this coverage map in sync.

## Scope guardrails

The intended V1 is:

- org-scoped `AgentEnvironment`
- `local` and `provisioned` adapter types only
- no first-party AWS/Fly/Kubernetes adapter in Trace core
- signed provisioned lifecycle endpoint for start/stop/status
- existing desktop bridge behavior preserved
- cloud runtimes connect back through the shared runtime bridge
- startup timeout and queued-message delivery for slow provisioned runtimes
- adapter-owned deprovisioning and reconciliation
- org settings UI plus session environment selection

If you are tempted to add a provider-specific adapter to Trace core, build it as a reference launcher instead.
