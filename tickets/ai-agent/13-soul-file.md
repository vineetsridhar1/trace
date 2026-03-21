# 13 — Soul File

## Summary

The soul file is a structured markdown document that defines the agent's personality, tone, domain expertise, priorities, and behavioral rules per organization. It's the primary lever for orgs to customize agent behavior without touching code.

## What needs to happen

- Create a platform default soul file at `apps/server/src/agent/default-soul.md` — conservative, generic, professional baseline
- Store the org-level soul file in `OrgAgentSettings.soulFile` (already added in ticket 03)
- Create a soul file resolver that merges sources in priority order:
  1. Platform default (always present as fallback)
  2. Org-level soul file (overrides platform default)
  3. Project-level overrides (optional — a project can add or modify rules for its scope)
  4. Repo-level `.trace/soul.md` (optional, merged for events involving that repo)
- More specific sources override less specific ones
- The context builder (ticket 10) should call the resolver and include the resolved soul file in the context packet
- Add a GraphQL mutation for org admins to update their soul file
- Add a simple UI in org settings to edit the soul file (a markdown textarea)
- The soul file is positioned in the planner prompt between the action schema and the event context

### Default soul file content

Should include:
- Generic identity statement
- Conservative behavioral defaults (prefer suggesting over acting, be concise, default to no_op when uncertain)
- Instruction to respect the autonomy mode
- Instruction to never share private DM content in other contexts

## Dependencies

- 03 (Agent Identity — org agent settings)
- 10 (Context Builder — consumes the soul file)

## Completion requirements

- [ ] Platform default soul file exists
- [ ] Soul file resolver merges platform default + org override + optional project override + optional repo override
- [ ] Org admins can update their soul file via GraphQL mutation
- [ ] Context builder includes the resolved soul file in the context packet
- [ ] Soul file is truncated to token budget (2000 tokens) if it exceeds allocation, from the bottom up
- [ ] UI exists in org settings for editing the soul file

## How to test

1. With no org soul file set — verify the planner sees the platform default
2. Set an org soul file — verify it overrides the platform default in the context packet
3. Create a `.trace/soul.md` in a repo, trigger an event in a session linked to that repo — verify the repo soul is merged
4. Write a soul file that exceeds 2000 tokens — verify it's truncated from the bottom (identity preserved, detailed rules trimmed)
5. Update the soul file via the UI — verify the change takes effect on the next planner call
