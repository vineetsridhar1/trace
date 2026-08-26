# Visual plan canvas

This is a design brief, not markup. Do not reproduce it as HTML structure or copy fragments from
it. Read it, then write the document yourself — your own markup, your own CSS, your own drawings.

**A visual plan is a drawn document.** If a reader can absorb your plan by reading it top to bottom
as prose, you have written a memo with borders around the paragraphs, not a visual plan. The
pictures are the plan. The text annotates them.

---

## Part 1 — The rule that matters most

> Every major section opens with a drawing. The prose explains the drawing; the drawing does not
> illustrate the prose.

A plan of eight sections has **at least eight drawn figures**. Fewer than six and the document has
failed regardless of how correct it is.

### What counts as a drawing

A drawing is a figure where **position, size, shape, proportion, or connection carries meaning**
that the text does not. Move an element and the meaning changes.

What does **not** count, no matter how nicely styled:

- a rounded rectangle with a label centered inside it;
- a row of cards;
- a table;
- a bordered callout;
- a two-column "before / after" of two bulleted lists;
- a flowchart that is four labelled boxes in a row with arrows between them, where the boxes could
  equally have been numbered list items.

That last one is the most common counterfeit. Boxes-with-arrows is the shape people reach for when
they want the _look_ of a diagram without doing the work of one. If your only figure is a chain of
labelled rectangles, you have drawn a list sideways.

### Draw the thing itself

Before defaulting to abstraction, ask what the subject actually _looks like_, and draw that.

- Explaining a queue? Draw items in a queue, at different depths, with one being pulled off.
- Explaining a retry? Draw the same request three times, fading, with the backoff gaps to scale.
- Explaining a cache hit rate? Draw the requests, most of them stopping at the cache.
- Explaining a migration? Draw both schemas as shapes and the records physically moving.
- Explaining a race? Draw two timelines with the overlap shaded.
- Explaining blast radius? Draw concentric rings with the real callers placed in them.
- Explaining a size or count? Draw it to scale so the eye compares — never write the number in a
  box and call it a metric.

Literal, slightly diagrammatic illustration beats abstract node graphs almost every time. It is
also harder, which is why it is rare and why it works.

---

## Part 2 — Figure catalogue

Reach for these before reaching for a card grid. Build the ones this change needs; invent others.

**Proportional figures** — where size or length encodes a real quantity:

- **To-scale bars** for counts that should be compared, drawn as bars, not printed as numerals.
- **Diff shape** — one stacked bar per file, segments sized by lines added and removed, so the
  reader sees where the weight of the change actually sits.
- **Blast radius** — concentric rings, direct callers in the inner ring, transitive further out.
- **Coverage/fill meters** — a track partially filled, for "12 of 40 call sites migrated".
- **Specimen comparison** — when the subject is visual (type, spacing, color), render the actual
  thing at actual size side by side. Do not describe it in a table.

**Structural figures** — where topology encodes relationships:

- **System map** with real geometry: boundaries as enclosing regions, ownership as containment,
  crossings drawn where data crosses. Not a row of services.
- **Fan-in / fan-out** — one node with its real dependents drawn radiating, count visible at a
  glance.
- **Layer cake** — stacked strata for anything with tiers, with the changed stratum highlighted.
- **Annotated anatomy** — draw the artifact (a request, a document, a record) and label its parts
  with leader lines, like a diagram in a manual.

**Temporal figures** — where the horizontal axis is time or sequence:

- **Timeline track** with proportional durations and markers, not a vertical bulleted list.
- **Sequence** across parties, with the vertical axis being real ordering.
- **State machine** with states as distinct shapes and labelled transitions, including the failure
  transitions.

**Comparative figures**:

- **Drawn before/after** — the two states as _pictures_ placed side by side so the difference is
  visible pre-attentively. Two lists in two columns is not this.
- **Overlay** — the new path drawn on top of the old one in the accent color, so the delta is the
  only thing that stands out.

Text components — cards, tables, callouts, chips, `<details>` — still exist and are still useful.
They are supporting cast. If they outnumber the figures, rebalance.

---

## Part 3 — How to draw well in inline SVG

Everything is hand-authored inline SVG, CSS shapes, or `data:` URLs. No libraries.

- Set a `viewBox` and let width scale to the container. Draw at a comfortable coordinate scale
  (say 0–1000 wide) and stop thinking in pixels.
- Use CSS custom properties for every `fill` and `stroke` so figures follow the document's palette
  and both color schemes automatically. Never hardcode a hex inside a figure.
- Build arrowheads once with `<defs><marker>` and reuse. Label arrows with what moves or what
  triggers the transition — an unlabelled arrow is decoration.
- Compose shapes. A drawn object is usually three to eight primitives — a body, a highlight, a
  shadow, a detail — not one `<rect>`. This is the single biggest difference between a figure that
  looks drawn and one that looks generated.
- Use `<path>` with real curves for anything organic. Use `opacity` and layering for depth,
  emphasis, and ghosting the "before" state.
- Vary stroke weight deliberately: heavier for the subject, hairline for context and grid.
- Annotate inside the figure with small text and leader lines. A figure that needs a paragraph
  underneath to be understood is not finished.
- Distinguish existing, changed, new, and removed with both color and treatment — dashed outlines,
  fills, opacity — so the figure survives grayscale and color blindness.
- Give every figure `role="img"`, a `<title>`, and a `<desc>` that states the conclusion. Wrap it
  in `<figure>` with a `<figcaption>` that says what the reader should take away, not what the
  figure contains.

Aim for figures wide enough to breathe — most should span the full content column.

---

## Part 4 — The story

Ten movements. Reorder, merge, or drop any of them; a change with no migration needs no migration
section. What must survive is the reading order: a reviewer reaches a decision before the evidence.
**Each of these opens with its figure.**

**Header.** The change in one line, as a claim a reviewer can agree or disagree with. Then the
decision being asked for. Open with a hero figure that shows the change's essential idea in one
picture — this is the image the reviewer remembers.

**At a glance.** The size of the work, drawn to scale. Files touched, surfaces added, phases,
consumers affected. Draw the comparison; do not print five numerals in five boxes.

**Scope and non-goals.** Draw the boundary. What is inside it and what is deliberately outside,
as a picture of a boundary — the non-goals are what reviewers argue with, so make them visible,
not a second column of bullets.

**Current state.** How it works today, grounded in real paths and symbols, drawn as the actual
topology. This is where you prove you read the code.

**How it will work.** The proposed behavior and its boundaries, as a drawn before/after or an
overlay of the new path on the old.

**The critical flow.** The thing most likely to be gotten wrong — the branch, the retry, the
ordering, the failure path. Show the unhappy path; that is usually the whole reason it exists.

**Phases.** A drawn timeline. Each phase names what it proves; a phase that cannot be verified
independently is not a phase.

**File impact.** Draw the shape of the diff, then table the paths beneath it. Every path you will
create, modify, or delete, each with a one-line reason.

**Verification.** How anyone knows it worked: the specific tests, the manual check, the observable
signal.

**Risks and assumptions.** Each risk with its mitigation, each assumption with the consequence of
being wrong. Where a risk has shape — a distribution, a window, a radius — draw it.

### What stays visible

The decision, behavioral changes, breaking changes, migrations, critical risks, and unresolved
reviewer choices are never inside an accordion. Substantiation goes behind `<details>` with a
`<summary>` that carries its own conclusion.

---

## Part 5 — The visual system

Design it yourself. This is the standard to hit, not a stylesheet to paste.

### Typography

The most common failure is flat type: a small uppercase gray label used as a section heading,
sitting beneath larger body text, so nothing has hierarchy. Build real contrast:

| Role              | Weight                   | Notes                                                      |
| ----------------- | ------------------------ | ---------------------------------------------------------- |
| Page title        | Heavy                    | Genuinely large. `clamp()` it.                             |
| Section heading   | Semibold                 | **Visibly larger than body text.** A heading, not a label. |
| Subsection        | Semibold                 | Body size or slightly above.                               |
| Body              | Regular                  | Comfortable, line-height near 1.6.                         |
| Eyebrow           | Bold, tracked, uppercase | Small. Use _above_ a heading, never _as_ one.              |
| Figure annotation | Medium                   | Small, but legible at the figure's rendered size.          |
| Path / identifier | —                        | Monospace, slightly below body.                            |

Set a measure on prose. Let titles and figures run wider than the paragraphs.

### Color

Choose a palette for this document. Do not reach for neutral-gray-on-near-black by reflex — that is
how every generated document looks. Define roles as custom properties:

- a background family: page, raised surface, one further level;
- foreground at three strengths;
- one accent, used sparingly enough to mean something;
- three change semantics — added, modified, removed — legible on every surface;
- a border tone that separates without attracting attention.

Support both schemes with `prefers-color-scheme`, and check that every figure works in both.

### Space and rhythm

Comfortable maximum width, centered. Sections separated enough that scrolling feels like moving
between chapters. Figures need generous margins above and below — a cramped figure reads as an
illustration of the paragraph rather than the subject of the section.

### Shape

One radius, one border weight, one elevation treatment, applied consistently.

---

## Part 6 — Craft

Make this good. Not merely correct — good. A reviewer should be able to tell in two seconds that
someone made this document for this change.

Before publishing, count your figures. If the number is under six, or if any of them is a labelled
rectangle standing in for a picture you did not want to draw, go back and draw it.

## Part 7 — Hard constraints

- One self-contained HTML file. Inline `<style>` only.
- No JavaScript. Trace renders plans as static documents with scripting disabled.
- No linked stylesheets, script sources, remote images, fonts, frames, or forms. Every visual asset
  is inline SVG, a CSS shape, or a `data:` URL.
- No ASCII diagrams and no external diagram libraries.
- Semantic HTML. `<figure>` / `<figcaption>` for figures, `<details>` for disclosure.
- Write _about_ the change, not the change. Name a function and say what it will do; do not paste
  its body.
- Every claim must be true of the repository.
