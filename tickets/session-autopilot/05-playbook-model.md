# 05 — Playbook Model

## Summary

Add durable playbooks that tell orchestrator episodes how to work through a project.

## Scope

- Add a playbook model or configuration surface.
- Link a playbook to an organization/project/project run.
- Provide a default playbook:
  - implement ticket
  - review against plan
  - fix issues
  - ask human for QA when needed
  - apply user suggestions
  - rereview
  - create PR
  - merge when allowed
- Keep playbooks as guidelines, not hardcoded workflow logic.

## Completion requirements

- [ ] A project run can resolve its effective playbook.
- [ ] The default playbook is stored in the repo or DB.
- [ ] Playbook text is included in orchestrator context.
- [ ] Playbook updates do not require code changes.
- [ ] Tests cover project/default playbook resolution.

## Notes

- The user will provide a richer orchestrator context template later. Do not overfit the schema to a temporary prompt.
