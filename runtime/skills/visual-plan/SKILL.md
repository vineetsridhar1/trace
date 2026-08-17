---
name: visual-plan
description: Research a repository change and publish a source-backed, visually rich implementation scoping document as a single static HTML artifact for review and approval.
---

# Visual plan

A visual plan is one polished, self-contained HTML canvas that a reviewer approves or sends back.
When approved, it becomes the implementing agent's brief, so every claim must be true of the
repository.

Design for two reading modes:

- Give a reviewer the decision, value, scope, architecture, and major risks in a 90-second scan.
- Give an implementer enough expandable evidence, contracts, file detail, and verification criteria
  to execute without repeating discovery.

Keep approval-critical information visible. Put substantiation and execution detail behind
progressive disclosure; never bury a breaking change, open decision, migration, or major risk.

Trace plans use this skill and the Trace artifact CLI only. Do not use an Agent-Native or
Builder-style plan skill, MDX plan blocks, a watched plan file, or a provider-native plan approval
tool. Trace does not watch the repository: the completed plan folder is published explicitly as an
immutable artifact and Trace renders its HTML document for review.

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

Prefer reading a few files completely over grepping many files shallowly. Keep notes as evidence,
but make the published canvas a coherent argument rather than a research dump.

## 2. Design the explanation

Choose the story and visuals from the shape of the change. Use:

- a flowchart for branching logic, validation, retries, and failure paths;
- an architecture or dependency map for system boundaries and ownership;
- a sequence or timeline for ordered interactions and rollout;
- a before/after comparison for replacement or migration;
- a state view for lifecycle behavior;
- an impact matrix for many files, consumers, or cases;
- a decision table for meaningful alternatives.

Use the smallest visual that makes the relationship obvious. Do not turn prose into decorative
boxes or invent quantitative charts without real data. Label arrows with what moves or what causes
the transition, show important unhappy paths, and distinguish existing, changed, and new nodes.
Prefer editable HTML/CSS for simple diagrams and inline SVG for branches or connectors that would
otherwise be ambiguous. Do not use ASCII diagrams or external diagram libraries.

Cover, in whatever order best explains the change: objective and outcome, scope and explicit
non-goals, current state grounded in real paths, the proposed behavior and boundaries, phased work,
the file impact map, verification criteria, and risks with mitigations. State assumptions as
assumptions and include the consequence of being wrong.

Use `<details>` for supporting material. Write a conclusion-bearing `<summary>` that remains useful
when collapsed. Keep the decision, behavioral changes, critical risks, migrations, and unresolved
reviewer choices outside accordions.

## 3. Build the canvas

First choose a durable, descriptive folder for the plan in the repository. Look for an existing
documentation directory such as `docs/`, `doc/`, or `documentation/`; use the project's existing
convention when one exists. Otherwise create `docs/`. Put the plan in a change-specific folder such
as `docs/session-artifact-upload-plan/`, not at the repository root. Everything created for the plan
belongs in that folder so the folder itself is the artifact source.

Start the named plan from the supplied canvas template, which carries the component vocabulary and
visual system:

```bash
mkdir -p docs/session-artifact-upload-plan
cp "$TRACE_SKILLS_DIR/visual-plan/template.html" \
  docs/session-artifact-upload-plan/implementation-approach.html
```

The HTML filename is descriptive, not standardized. Treat the copied file as a component palette,
not a form: delete sample sections, reorder the story, combine components, and add shapes when the
change calls for them. The template demonstrates summaries and metrics, cards, flows, before/after
views, a branching flowchart, an interaction sequence, phases, accordions, tables, tags, callouts,
and static comparison views.

Use inline CSS and inline SVG to make the explanation clear. Do not include JavaScript. Trace
renders plans as static documents with scripting disabled. Prefer semantic HTML, and use native
elements such as `<details>` when supporting information needs progressive disclosure.

Write about the change; do not write the change. Name the function and describe what it will do
instead of pasting its body. A plan that contains the implementation is not reviewable.

Before publishing, verify:

- The visible layer stands alone as a 90-second decision brief.
- Expanded detail adds evidence rather than repeating the summary.
- Every visual answers a relationship, sequence, state, comparison, or impact question.
- Every proposed boundary change names its affected files or symbols and its verification method.
- Facts, assumptions, open decisions, and non-goals are distinguishable.
- Another agent could implement the plan without repeating repository discovery.

## 4. Publish

Upload the repository folder directly. Do not create a staging directory, rename the HTML, or copy
the plan elsewhere:

```bash
"$TRACE_CLI" artifact push visual-plan docs/session-artifact-upload-plan --key primary
```

The folder must contain exactly one HTML file, but that file may have any name and may sit anywhere
inside the folder. Supporting notes or evidence may live beside it and are preserved in the artifact.
The rendered HTML remains self-contained: no scripts, linked stylesheets, remote images, fonts,
frames, or forms. Use inline SVG, `data:` URLs, or CSS shapes for visual assets.

Publish once, when the canvas is complete. Do not print the plan into chat and do not invoke a
provider-native plan approval tool. Trace renders the uploaded artifact; after the upload succeeds,
tell the user in one line that the plan is ready for review.

Revising after feedback is the same loop: edit the file and push again. Each push is a new
immutable artifact and the reviewer sees the newest one.
