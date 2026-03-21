# 06 — Action Registry

## Summary

The action registry defines every action the AI agent can take. It maps action names to service methods and provides metadata (risk level, description, parameter schema) that the planner and policy engine use. The model never invents actions — it picks from this registry.

## What needs to happen

- Create `apps/server/src/agent/action-registry.ts`
- Define the `AgentActionRegistration` interface with: `name`, `service`, `method`, `description`, `risk` (low/medium/high), `suggestable` (boolean), `parameters` (Zod or JSON schema), `scopes` (which scope types can trigger it)
- Register the initial action set:
  - `ticket.create` — medium risk, suggestable
  - `ticket.update` — medium risk, suggestable
  - `ticket.addComment` — medium risk, suggestable
  - `message.send` — medium risk, suggestable (for chat messages; channel messages will be added later)
  - `link.create` — low risk, suggestable
  - `session.start` — high risk, suggestable
  - `session.pause` — medium risk, suggestable
  - `session.resume` — medium risk, suggestable
  - `escalate.toHuman` — low risk, not suggestable (creates an InboxItem notifying the relevant user that the agent needs help)
  - `summary.update` — low risk, not suggestable (silent enrichment)
  - `no_op` — low risk, not suggestable (do nothing)
- Parameter schemas should reuse existing service input types where possible
- The registry should export:
  - A function to get all actions (for building the planner prompt)
  - A function to get actions filtered by scope type
  - A function to find a specific action by name
- The action descriptions should be clear enough for an LLM to understand when to use each action

## Dependencies

None — this is a data definition. But it will be consumed by tickets 07, 10, and 11.

## Completion requirements

- [ ] Action registry module exists with all initial actions registered
- [ ] Each action maps to a real service and method that exists in the codebase
- [ ] Parameter schemas are defined and validate correctly
- [ ] Registry can be queried by name, by scope, or in full
- [ ] `no_op` is explicitly registered with a description emphasizing it's the default choice
- [ ] Adding a new action is a single registry entry — no other changes needed

## How to test

1. Import the registry and call `getAll()` — verify all actions are returned with complete metadata
2. Call `getByScope("chat")` — verify only chat-relevant actions are returned
3. Call `find("ticket.create")` — verify the correct registration is returned
4. Validate a sample input against each action's parameter schema — verify valid inputs pass and invalid inputs fail
