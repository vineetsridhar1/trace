---
name: trace-designs
description: Refresh linked Trace design-session source before implementing or updating a design.
---

# Trace designs

Linked designs are available through the installed and authenticated `trace` CLI.

Before implementing a linked design, and whenever the user asks for the latest design changes, run:

```bash
trace design pull
```

This atomically refreshes every linked design under `.trace/designs/<slug>/` and prints the exact
saved commit fetched. To inspect or refresh one design, use:

```bash
trace design list --json
trace design pull <id-or-slug>
```

Read `design.canvas.json` and `design.brief.json` first, then implement from `src/design/` using
`trace.tokens.json`. Treat the linked design directory as read-only reference source; make product
changes in the project itself.
