# 03 — Agent Identity & Permissions

## Summary

The AI agent needs a concrete identity within each organization. Every action the agent takes must be attributable to a specific actor with `actorType: "agent"`. Create per-org agent identities and a permission system that controls what the agent can do.

## What needs to happen

- Create an `AgentIdentity` model (or equivalent) that represents the ambient agent for each org. Each org gets one agent identity created automatically when the org is created (or via a migration for existing orgs)
- The agent identity should have: `id`, `organizationId`, `name` (e.g. "Trace AI"), `status` (enabled/disabled)
- Add `OrgAgentSettings` to the Organization model (can be a JSON field on `Organization.settings` or a separate table). Should include:
  - `aiEnabled: boolean`
  - `autonomyMode: "observe" | "suggest" | "act"`
  - `soulFile: string` (markdown, can be empty for now)
  - `costBudget: { dailyLimitCents: number }`
- Create a service method to resolve the agent identity and settings for a given org
- The agent worker should load agent identities on startup and use the correct `agentId` when processing events for each org
- All service calls from the agent must include `actorType: "agent"` and `actorId: <agent-identity-id>`

## Dependencies

- 02 (Agent Worker Process)

## Completion requirements

- [x] Agent identity is automatically created for each org
- [x] Existing orgs get agent identities via migration
- [x] Org agent settings exist with `aiEnabled`, `autonomyMode`, `soulFile`, `costBudget`
  <!-- Implementation note: `aiEnabled` was collapsed into `status` (enabled/disabled) on AgentIdentity. Downstream tickets (04 router) should use `status === "enabled"` instead of a separate `aiEnabled` boolean. -->
- [x] Service method exists to fetch agent identity and settings by org
- [x] Agent worker uses the correct agent identity per org when processing events
- [ ] Events created by the agent show `actorType: "agent"` and the correct `actorId`
  <!-- Deferred: no actions are taken yet. The plumbing is in place (agentId available in worker context). Will be verified when ticket 07 (Action Executor) is implemented. -->

## Implementation notes

<!-- Added after PR #84 -->
- **Model choice**: `AgentIdentity` is a dedicated Prisma model (1:1 with Organization), not a JSON field. This gives proper typing, migrations, and indexing.
- **`aiEnabled` collapsed into `status`**: Rather than a separate `aiEnabled` boolean, the `status` field (enabled/disabled) serves double duty. Ticket 04 should check `status === "enabled"` for the "is AI active" gate.
- **GraphQL API**: Added `agentIdentity(organizationId)` query and `updateAgentSettings` mutation (not originally in ticket spec, but needed for the soul file editor in ticket 13).
- **Actor resolution**: Both `resolveActor` and `resolveActors` now look up agent names from the `AgentIdentity` table.
- **In-memory cache**: The agent worker caches `OrgAgentSettings` per org. Settings changes take up to 30s to propagate (org poll interval).

## How to test

1. Run the migration — verify each existing org gets an agent identity
2. Create a new org — verify an agent identity is auto-created
3. Query agent settings for an org — verify defaults are returned
4. In a later ticket when the agent takes actions, verify events show the correct agent actor
