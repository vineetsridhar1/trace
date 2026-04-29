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
| 06  | [Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)                     | Adds authenticated start/stop/status lifecycle endpoint support                  |

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

## Plan coverage matrix

Every line of [agent-environments-plan.md](agent-environments-plan.md) has an owning ticket. Line ranges below refer to the current plan file.

| Plan lines | Plan content | Owning ticket(s) |
| --- | --- | --- |
| 1-29 | Goal, local/provisioned/reference launcher direction, no first-class Fly core adapter | 01, 04, 05, 06, 12, 14 |
| 30-42 | Current baseline and existing bridge/session-router shape | 04, 05, 12 |
| 43-92 | Agent environment concept, fields, adapter types, admission constraints, provisioned endpoints, reference launchers | 01, 02, 03, 06, 14 |
| 93-105 | Runtime adapter responsibilities and separation from message handling | 04, 06, 08 |
| 106-126 | Runtime bridge command traffic, heartbeats, output, workspace events, shared local/cloud protocol | 05, 07, 08, 09 |
| 127-144 | Target architecture and adapter/bridge split | 03, 04, 05, 06, 07 |
| 137-163 | `AgentEnvironment` Prisma model, indexes, default enforcement | 01, 03 |
| 164-190 | Normalized `Session.connection` runtime state | 01, 08, 09, 11 |
| 191-216 | Deferred `SessionRuntime` table | 15 |
| 217-292 | GraphQL environment types, query/mutations, `environmentId`, compatibility inputs, codegen | 02 |
| 293-340 | `AgentEnvironmentService`, CRUD/default/validation/auth/events, thin resolvers | 03 |
| 341-362 | `SessionService` environment resolution, admission checks, and `hosting` compatibility | 11, 12 |
| 363-420 | Runtime adapter interface and start result contracts | 04 |
| 421-438 | Runtime adapter registry and no direct cloud branching | 04, 12 |
| 439-482 | Local adapter config, start flow, stop flow, no host deprovisioning | 05, 09 |
| 483-564 | Provisioned adapter purpose, generic provider contract, config, start request/response, readiness | 06, 08, 12 |
| 565-612 | Provisioned stop/status requests and provider-status mapping | 06, 09 |
| 613-672 | Lifecycle request auth, bearer mode, idempotency, optional HMAC mode, replay/timestamp rejection | 06, 14 |
| 673-703 | Cloud runtime bridge bootstrap env vars, `runtime_hello`, protocol metadata, empty registered repos | 06, 07 |
| 704-727 | Runtime token claims and bridge validation, preserve local auth | 07 |
| 728-762 | Startup lifecycle states and bridge-readiness rule | 08 |
| 763-781 | Pending message delivery, bridge-only AI message channel, provisioned adapter does not receive AI messages | 08 |
| 782-831 | Local/provisioned deprovisioning and environment deprovision policies | 09 |
| 832-856 | Provider-neutral runtime lifecycle events | 01, 08, 09, 12 |
| 857-909 | Org settings UI, local/provisioned forms, session environment selector | 10, 11 |
| 910-938 | Secret storage, encrypted values, config secret references, service-layer resolution | 01, 03, 06, 10 |
| 939-1001 | Migration phases from model through compatibility cleanup | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12 |
| 1002-1041 | Unit, service, and integration tests | 13 plus each implementation ticket's test section |
| 1042-1051 | Open decisions | 05, 06, 07, 12, 15 |
| 1052-1077 | Recommended V1 scope and AWS VPC shape through provisioned adapter | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12 |

If the plan gains a new actionable requirement, add or update its owning ticket in the same change and keep this coverage matrix in sync.

## Scope guardrails

The intended V1 is:

- org-scoped `AgentEnvironment`
- `local` and `provisioned` adapter types only
- no first-party AWS/Fly/Kubernetes adapter in Trace core
- authenticated provisioned lifecycle endpoint for start/stop/status
- existing desktop bridge behavior preserved
- cloud runtimes connect back through the shared runtime bridge
- startup timeout and queued-message delivery for slow provisioned runtimes
- adapter-owned deprovisioning and reconciliation
- org settings UI plus session environment selection

If you are tempted to add a provider-specific adapter to Trace core, build it as a reference launcher instead.
