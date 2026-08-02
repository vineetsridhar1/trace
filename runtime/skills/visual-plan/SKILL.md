---
name: visual-plan
description: Create a rich, reviewable implementation plan as a single MDX artifact.
---

# Visual plan

Create a directory for the plan outside application source. It must contain exactly one document,
`plan.mdx`, at its root. Images the plan displays go under `assets/` and must be referenced from
`plan.mdx` with a relative path such as `![Data flow](assets/data-flow.png)`. Nothing else belongs
in the bundle — no second document, no source files, no unreferenced assets. A bundle that breaks
these rules is rejected on upload.

`plan.mdx` is the whole plan. A reviewer reads it top to bottom and decides. Include:

- Objective, scope, assumptions, and explicit non-goals.
- Current-state findings grounded in the repository, citing real file paths.
- Architecture and data flow where relationships matter.
- Concrete service, schema, event, runtime, and client changes.
- A phased file map and verification criteria.
- Risks, migration strategy, and deferred work.

Write prose, tables, and lists. Name the functions and files you will change and describe each
change; do not paste the implementation you intend to write. MDX must not import code or execute
JavaScript.

When the complete plan is ready for review, publish it exactly once:

```bash
trace artifact push visual-plan <plan-directory> --key primary
```

Do not print the complete plan into chat and do not invoke a provider-native plan approval tool.
After upload succeeds, briefly tell the user the plan is ready for review.
