# 08 — Planning Context Packet Builder

## Summary

Build compact context packets for project planning and controller runs.

## What needs to happen

- Build context from:
  - project details
  - project members
  - repo metadata
  - initial goal
  - planning summary
  - prior questions and answers
  - recorded decisions
  - existing project tickets
  - dependency graph when present
  - prior controller summaries when present
- Keep packets bounded and deterministic.
- Exclude unrelated channels/chats unless linked and relevant.
- Include action permissions and constraints.

## Deliverable

Planning/controller sessions receive enough context to act without reading unbounded transcripts.

## Completion requirements

- [ ] Context packet includes canonical project state.
- [ ] Packet includes linked project tickets.
- [ ] Packet includes dependency summaries.
- [ ] Packet includes prior summaries rather than full transcripts by default.
- [ ] Packet includes allowed action list.
- [ ] Tests cover empty project, planning project, and ticketed project.

## Implementation notes

- Reuse existing agent context-builder patterns where practical.
- Keep project context separate from session-group execution context.
- Add execution details later when worker orchestration ships.

## How to test

1. Build context for a new project run.
2. Build context after multiple interview turns.
3. Build context after ticket generation.
4. Verify token-bounded summaries are stable.
