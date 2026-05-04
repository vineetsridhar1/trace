# 05 — Playbook Model

## Summary

Add durable playbooks that tell orchestrator episodes how to work through a project.

## Scope

- Add a playbook model or configuration surface.
- Link a playbook to an organization/project/project run.
- Version playbooks and snapshot the effective version used by each project run or orchestrator episode.
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
- Keep service-level state transition guards outside the playbook. A playbook can guide the orchestrator, but it cannot authorize out-of-scope actions.
- Resolve playbook precedence explicitly, for example project run override, then project default, then organization default, then built-in default.

## Completion requirements

- [ ] A project run can resolve its effective playbook.
- [ ] The default playbook is stored in the repo or DB.
- [ ] Playbook text is included in orchestrator context.
- [ ] Playbook updates do not require code changes.
- [ ] In-flight episodes are replayable because they reference a stable playbook version or snapshot.
- [ ] Permission-sensitive actions such as PR merge remain controlled by service config, not only playbook text.
- [ ] Tests cover project/default playbook resolution.

## Notes

- The user will provide a richer orchestrator context template later. Do not overfit the schema to a temporary prompt.
- Avoid prompt-shaped columns. Store text plus small structured metadata, then let ticket 07 build the final packet.
