# 06 — Client Store and Project Event Hydration

## Summary

Add Zustand/client-core support for project orchestration entities and project-scoped events.

## What needs to happen

- Add entity store tables for any new durable client entities:
  - projects if not already normalized enough
  - project runs
  - planned tickets
  - controller runs when introduced
  - ticket executions when introduced
- Add event handlers for project event families.
- Add project scope helpers:
  - `eventScopeKey("project", projectId)`
  - project-scoped event selectors
- Ensure urql remains transport-only.
- Add optimistic support for prompt-first project creation if needed.

## Deliverable

Project views can hydrate from events and render from Zustand.

## Completion requirements

- [ ] Project events update normalized store state.
- [ ] Project runs hydrate from event snapshots.
- [ ] Planned tickets hydrate from event snapshots.
- [ ] Project-scoped events are stored by scope, not in generic entity tables.
- [ ] Existing channel/session/ticket event handling remains unchanged.
- [ ] Tests cover project event upserts.

## Implementation notes

- Follow existing event partitioning rules.
- Do not use urql normalized cache for state.
- Prefer selectors by entity ID.

## How to test

1. Unit test project created/updated event handlers.
2. Unit test project run created/updated event handlers.
3. Verify project views update after event delivery without refetching.
