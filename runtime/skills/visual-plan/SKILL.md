---
name: visual-plan
description: Research a change and publish a reviewable implementation plan as a single HTML artifact.
---

# Visual plan

A visual plan is one self-contained HTML file that a reviewer reads top to bottom and approves or
sends back. When it is approved, its content becomes the brief the implementing agent works from,
so every claim in it has to be true of this repository.

Trace plans use this skill and the Trace artifact CLI only. Do not use an Agent-Native or
Builder-style plan skill, MDX plan blocks, a watched `plan.mdx` file, or a provider-native plan
approval tool. Trace does not watch a plan file: the completed `plan.html` is published explicitly
as an immutable artifact.

## 1. Research before writing

A plan invented from the request alone is worthless. Read the code first and let what you find
change the plan. Look for:

- **The entry points the request touches.** Find the actual files. Name them in the plan.
- **The existing pattern for this kind of work.** Nearly every change has a sibling that already
  solved something similar. Find it and follow it rather than inventing a second approach. Say
  which sibling you followed.
- **The seams.** Where does the data cross a boundary — service, schema, event, adapter, client
  store? Those are where the work and the risk actually live.
- **What already breaks if you are wrong.** Existing tests, validation, and callers. A plan that
  does not know its blast radius cannot estimate its risk.
- **Project rules that constrain the design.** Read `CLAUDE.md` / `AGENTS.md` if present. A plan
  that violates them gets rejected no matter how good it looks.
- **What you could not determine.** Unknowns are content. State them as assumptions with the
  consequence of being wrong, rather than papering over them.

Prefer reading a few files completely over grepping many files shallowly.

## 2. Write the plan

Start from the starter template, which carries the component vocabulary:

```bash
mkdir -p .trace-work/plan
cp "$TRACE_SKILLS_DIR/visual-plan/template.html" .trace-work/plan/plan.html
```

The template's `<style>` block defines every component available: `.plan-title`, `.plan-summary`,
`.meta`/`.chip`, `.split`/`.card` for scope against non-goals, `.flow`/`.node`/`.arrow` for data
flow, `.phase` for sequenced work, tables for file maps and verification, `.tag` for add/change/
remove, and `.callout` for risks. Each one is demonstrated in the template body. Compose from these
rather than writing new CSS; add a rule only when the plan genuinely needs a shape none of them
make, and keep it in the same `<style>` block.

Cover, in whatever order suits the change: objective and summary, scope and explicit non-goals,
current state grounded in real paths, how the change works, phased work, the file map, verification
criteria, and risks with mitigations.

Reach for a diagram when a relationship is hard to say in a sentence — what calls what, what moves
through a pipeline, what is new against what exists. Use the flow and table components for it. Do
not draw ASCII boxes.

Write about the change; do not write the change. Name the function and describe what it will do
instead of pasting its body. A plan that contains the implementation is not reviewable.

## 3. Publish

```bash
trace artifact push visual-plan .trace-work/plan --key primary
```

The upload is rejected unless the directory holds exactly one file, `plan.html`, with no external
references — no linked stylesheets, no remote images or fonts, no `<script>`. Inline the styles,
and use `data:` URLs or CSS shapes for any image. The plan renders with scripting disabled, so it
must read correctly as static markup.

Publish once, when the plan is complete. Do not print the plan into chat and do not invoke a
provider-native plan approval tool. After the upload succeeds, tell the user in one line that the
plan is ready for review.

Revising after feedback is the same loop: edit the file and push again. Each push is a new
immutable artifact and the reviewer sees the newest one.
