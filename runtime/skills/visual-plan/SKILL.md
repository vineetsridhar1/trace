---
name: visual-plan
description: Create a rich, reviewable implementation plan as a multi-file MDX artifact.
---

# Visual plan

Create a directory for the plan outside application source. It must contain `plan.mdx` at its
root. It may also contain `canvas.mdx`, `prototype.mdx`, and referenced files under `assets/`.

The plan must be implementation-ready and easy to scan. Include:

- Objective, scope, assumptions, and explicit non-goals.
- Current-state findings grounded in the repository.
- Architecture and data-flow diagrams where relationships matter.
- Concrete service, schema, event, runtime, and client changes.
- A phased file map and verification criteria.
- Risks, migration strategy, and deferred work.

Use Markdown for prose and Mermaid fenced blocks for diagrams. MDX must not import code or execute
JavaScript. Keep all asset references relative to the plan directory.

When the complete plan is ready for review, publish it exactly once:

```bash
trace artifact push visual-plan <plan-directory> --key primary
```

Do not print the complete plan into chat and do not invoke a provider-native plan approval tool.
After upload succeeds, briefly tell the user the plan is ready for review.
