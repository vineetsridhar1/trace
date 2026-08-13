---
name: visual-plan
description: Research a repository change and publish a source-backed, visually rich implementation scoping document as a single interactive HTML artifact for review and approval.
---

# Visual plan

A visual plan is one polished, self-contained HTML canvas that a reviewer approves or sends back.
When approved, it becomes the implementing agent's brief, so every claim must be true of the
repository.

Design for two reading modes:

- Give a reviewer the decision, value, scope, architecture, and major risks in a 90-second scan.
- Give an implementer enough expandable evidence, behavioral detail, and verification criteria to
  execute without repeating discovery.

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

## 2. Design the explanation around decisions

Do not fill out a plan form. First identify the few questions a reviewer must be able to answer to
approve this change: for example, "is this the right boundary?", "what behavior changes?", "how
will existing data or callers survive?", or "what is the smallest safe rollout?". Make each
visible section answer one of those questions. Omit sections that answer no question for this
change.

Before writing HTML, select one **story shape** and write a one-sentence private thesis in your
notes: "This plan helps the reviewer decide ___ by showing ___." The story shape determines the
reading order, section names, and primary visual. Choose the shape that exposes the change's
hardest uncertainty:

- **Failure-scenario walkthrough:** ask whether a promised outcome survives retries, races,
  outages, or bad input. Organize around the few consequential scenarios, not implementation
  layers. Use timelines, state snapshots, and a truth table.
- **User-journey walkthrough:** explain a product behavior whose value is best understood from a
  person's sequence of actions. Organize around moments in the journey and the information or
  control available at each moment.
- **Boundary contract:** establish ownership between systems or teams. Organize around the
  handoffs, contract fields, authority, and unacceptable messages.
- **Decision record:** choose among materially different approaches. Put the options, evaluation
  criteria, and chosen tradeoff at the center; implementation follows only after the choice.
- **Migration or rollout narrative:** establish how old and new behavior coexist, what gates
  progression, and how rollback preserves users. Organize in time, not by code layer.
- **Change map:** use only when the change is genuinely several independent workstreams. Organize
  around the workstreams and their dependency edges.

Do not use generic headings such as "Scope", "Current state", "How it will work", "Implementation
moves", "Files", "Risks", or "Verification" by default. Use one only when it is literally the
question this plan needs to answer. A plan that presents the standard headings under renamed labels
has not changed shape. A small, local change may be a title, a single annotated comparison, and a
proof note; that is a complete plan when it answers the decision.

Match plan depth to uncertainty, not to apparent change size:

- **Direct, local change:** outcome, precise behavior, implementation moves, and proof may be
  enough. Use one comparison or flow only if it makes the behavior clearer.
- **Cross-boundary change:** show the contract and the handoff between layers. Name the source and
  destination, the data or event that crosses, and each side's responsibility.
- **Behavioral or stateful change:** show normal, edge, and failure behavior. A decision flow or
  state view is usually more useful than a file list.
- **Migration, rollout, or compatibility change:** make before/after behavior, compatibility
  window, reversibility, and rollout gates visible.
- **Design choice with viable alternatives:** show the decision, rejected alternatives, and why.
  Do not disguise a meaningful choice as an implementation detail.

Describe execution as concrete moves, not vague phases or a file inventory. For each move, state:

- the responsible boundary or symbol;
- what behavior, contract, or invariant changes;
- the important condition, failure case, or compatibility constraint; and
- how that move is proved.

Name paths or symbols only where they anchor a claim, identify the owner of a change, or help an
implementer start. Include an impact map when several components or consumers need coordination;
do not list every touched file merely to look complete. State scope, non-goals, risks, assumptions,
or a phased rollout only when they materially constrain approval or implementation.

After drafting, perform a shape check: remove the title and ask whether this canvas could be reused
for an unrelated feature just by replacing nouns. If yes, rebuild it around the selected story
shape. The first three visible blocks must make the branch's unique problem apparent; they must not
be a reusable plan introduction, architecture diagram, and task list.

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

Start with the proposed outcome and the decision being requested. Then use only the evidence needed
to make that decision safe: current state when it explains a constraint, proposed behavior and
boundaries, concrete implementation moves, verification, and any material risk or unknown. State
assumptions with the consequence of being wrong.

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
not a form: begin by selecting a story shape, then assemble only components that serve that shape.
Reorder the story, combine components, and add shapes when the change calls for them. The template
supplies summaries and metrics, cards, flows, before/after views, a branching flowchart, an
interaction sequence, tables, tags, callouts, and small DOM-only interactions.

Use inline CSS, inline SVG, and concise inline JavaScript to make the explanation clear and
interactive. Scripts may modify only their own document: do not access the network, storage,
cookies, parent frame, navigation, popups, downloads, or external assets. Do not use `postMessage`.
Trace runs the document in an opaque-origin sandbox and blocks those capabilities. Prefer semantic
HTML and accessible controls; make the document understandable if an interaction is never used.

Use interaction to reveal relationships or detail—filtering an impact map, switching before/after,
highlighting a flow—not as decoration. Keep scripts small and dependency-free.

Write about the change; do not write the change. Name the function and describe what it will do
instead of pasting its body. A plan that contains the implementation is not reviewable.

Before publishing, verify:

- The visible layer stands alone as a 90-second decision brief.
- Expanded detail adds evidence rather than repeating the summary.
- Every visual answers a relationship, sequence, state, comparison, or impact question.
- Every proposed boundary change names its affected symbol or owner and its verification method.
- Each implementation move says what will change and how its behavior will be proved; no step is
  merely "update", "wire up", or "add support".
- The first three visible blocks expose the change-specific uncertainty, rather than a generic
  plan outline.
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
The rendered HTML remains self-contained: no linked stylesheets, script sources, remote images,
fonts, frames, or forms. Keep styles and scripts inline. Use inline SVG, `data:` URLs, or CSS shapes
for visual assets. Trace allows scripts to modify the artifact DOM while isolating the document from
the application and network.

Publish once, when the canvas is complete. Do not print the plan into chat and do not invoke a
provider-native plan approval tool. Trace renders the uploaded artifact; after the upload succeeds,
tell the user in one line that the plan is ready for review.

Revising after feedback is the same loop: edit the file and push again. Each push is a new
immutable artifact and the reviewer sees the newest one.
