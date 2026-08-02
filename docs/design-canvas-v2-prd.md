# Trace Design Canvas v2 PRD

Status: accepted for implementation (2026-08-02). The engine decision was pressure-tested
and confirmed in review; see the Decision Log at the end of this document, which controls
where it conflicts with earlier sections.

Decision: adopt tldraw as the Trace Design canvas engine and deliver the critical Replit
Design Canvas interaction loop without adopting Replit-specific assets, private extensions,
or tldraw-hosted persistence.

This document defines the next product layer for Trace Design: a selection-aware,
agent-native canvas workflow inspired by the Replit Design Canvas. It extends the shipped
Design-session architecture in `docs/design-sessions-v1.md` and the shipped custom design
system architecture in `docs/design-systems-plan.md`. It preserves their managed repository,
preview isolation, service/event, and design-system decisions while replacing the starter's
hand-built canvas interaction engine with tldraw.

## Executive Summary

Trace should make the existing Design canvas the place where users select, discuss,
annotate, directly edit, compare, and implement designs.

The core loop is:

```text
Create or open a Design
  -> select a frame, element, region, or annotation
  -> directly edit deterministic properties or ask the agent for a change
  -> compare new variants beside the source frame
  -> choose a direction
  -> export it or implement it in an App/Coding session
```

Trace already owns most of the difficult foundation:

- prompt-first `design` session groups;
- one managed repository and workspace per Design;
- one Vite/React canvas with sections and manifest-indexed screens;
- live preview updates through HMR;
- saved, commit-addressed HTML previews;
- element selection and deterministic text/style editing;
- immutable, selectable design-system versions;
- a design-to-session attachment service;
- an event-backed Zustand client and shared service layer.

Canvas v2 should add the missing interaction layer around that foundation:

- explicit Interact, Pan, Chat, Draw, Edit, and Generate modes;
- frame, element, region, annotation, and multi-selection;
- structured design context attached to normal Trace messages;
- persistent event-backed annotations;
- contextual next-step suggestions and variant lineage;
- a Templates, References, and Library drawer;
- selected-frame PNG export;
- a first-class Build handoff for selected screens;
- design-system apply/extract actions that preserve immutable version history.

The primary architectural decision is to adopt the
[tldraw SDK](https://github.com/tldraw/tldraw) as Trace's canvas interaction engine. tldraw
will own camera movement, selection geometry, hit testing, drawing tools, arrows, snapping,
undo/redo, and shape rendering. Trace will continue to own screen source, the manifest,
permissions, durable events, annotations, agent context, exports, and Build handoff. The SDK
runs inside the existing isolated Design runtime and iframe; Trace will not adopt tldraw's
hosted product or sync backend as a second platform.

## Research Basis

This PRD is based on a hands-on review of the shared
[Replit Design Project](https://replit.com/@ChrisSesi/Replit-Design-Project) on 2026-08-02,
plus Replit's current first-party documentation for
[Canvas](https://docs.replit.com/learn/design/canvas) and the
[Visual Editor](https://docs.replit.com/learn/design/visual-editor), and the current
[tldraw repository](https://github.com/tldraw/tldraw), SDK documentation, package metadata,
and [license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md). The proposed extension
model follows tldraw's public documentation for
[custom shapes](https://tldraw.dev/docs/shapes) and
[default shapes](https://tldraw.dev/sdk-features/default-shapes).

The observed project showed a selected interactive poster frame on an infinite board,
the Agent composer carrying the selected frame as context, a library drawer, contextual
suggestions, frame actions, and a bottom mode toolbar. Replit's documentation confirms
that Canvas supports live app previews, separate design mockups, annotations, images,
videos, side-by-side variants, user-flow mapping, PNG export, and conversion into working
artifacts.

The live Replit canvas exposed an application accessibility root named `tldraw`. The tldraw
repository also names Replit among products powered by the SDK. This is sufficient evidence
to adopt the same public foundation, although it does not establish Replit's exact SDK
version, private extensions, or commercial agreement.

Trace should use tldraw through its supported public extension points. It should not copy
Replit's private implementation details, visual assets, templates, or third-party content.

## Detailed Replit Canvas Review

### Workspace model

- The project has distinct **Design** and **Build** modes.
- Design mode is an infinite, dotted spatial board implemented with tldraw plus Replit-owned
  product UI and custom behavior.
- Artifacts appear as independently selectable frames on the board.
- A design frame is interactive: the user can use the rendered interface, not only view a
  bitmap.
- Other frames remain spatially visible while one is selected, making comparison feel
  native rather than modal.
- The selected frame receives resize/selection chrome, a title bar, contextual actions,
  nearby navigation controls, a color palette, and suggested next steps.

### Selection and agent context

- Selecting a frame adds a removable frame chip to the Agent composer.
- Element selection is also available from the composer and from Edit mode.
- Chat mode instructs the user to select an element or drag a region before sending a
  message.
- The agent prompt therefore carries both natural-language intent and explicit visual
  scope.
- Suggested actions are selection-specific. In the reviewed poster they included refine,
  add, reimagine, and explore directions tailored to that exact design.

### Canvas modes

| Mode | Observed behavior |
| --- | --- |
| Interact | The frame behaves like a live page; internal controls can be used. |
| Pan | The board is navigated without interacting with frame content. |
| Chat | The user selects an element or drags a region to attach visual context to a message. |
| Draw | A tool strip exposes brush, text, rectangle, arrow, sticky note, and colors. |
| Edit | A visual selector lets the user click a rendered DOM element and edit deterministic properties. |
| Generate | A menu offers Design, Image, Video, and Vector Graphic output intents. |

### Direct visual editing

After selecting the poster's heading in Edit mode, Replit exposed:

- text content;
- font size and token controls;
- font weight;
- text alignment;
- outer and inner spacing;
- text and background colors;
- opacity;
- border color, width, and radius;
- explicit Discard and Save actions.

This is materially similar to Trace's shipped manual design editor. Replit's first-party
Visual Editor documentation also describes deterministic text, color, layout, spacing,
and image changes without an agent round-trip, with complex changes handed to Agent.

### Templates, inspiration, and library

- **Templates** exposes searchable, categorized starting points such as landing pages,
  mobile screens, prototypes, posters, social posts, and email.
- **Inspiration** exposes searchable app-screen references, onboarding/signup/checkout
  shortcuts, and platform filtering. The reviewed implementation attributes this content
  to Mobbin.
- **Library** is the project-owned area for creating or reusing apps, documents, images,
  and other generated artifacts.
- The important product idea is a single drawer for starting points, references, and owned
  assets. Trace does not need a third-party inspiration feed to deliver the core value.

### Frame actions and lifecycle

- **Export** immediately exported the selected frame as PNG.
- **Build** offered to create a new artifact from the selected design.
- **Focus** isolated the selected frame.
- **More options** included open in a new tab, apply design system, and extract design
  system.
- Extract design system used an agent task, disclosed credit usage, and required later
  confirmation before anything was applied.
- Apply design system could import a system from the workspace.
- Generate → Design moved the selected frame into Agent chat as structured context rather
  than silently mutating the design.

### What makes the experience work

The individual tools are not the main advantage. The advantage is that all operations
share one selection model:

```text
Spatial selection
  -> direct edit, annotation, chat request, variant, design system, export, or build
```

The user never has to explain which screen, element, or design direction they mean. That
is the capability Trace should replicate.

## Critical Replit Parity Contract

Parity means matching the critical workflow and interaction capabilities, not copying
Replit's visual styling or reproducing every generator and content catalog. A release may
not be described as Replit Design Canvas parity until every P0 capability below is shipped.

### P0 — Required for the Canvas v2 release

| Capability | Required Trace behavior | Primary owner |
| --- | --- | --- |
| Infinite spatial board | Smooth pan, zoom, fit, focus, multi-select, and movable frames on one board. | tldraw runtime |
| Live interactive frames | Each manifest screen renders as a live React application frame; Interact mode supports buttons, inputs, scrolling, and navigation. | Custom `TraceScreenShapeUtil` |
| Shared selection model | A frame, marked DOM element, dragged region, or annotation can become the target for chat, editing, generation, export, or Build. | tldraw selection + Trace bridge |
| Contextual agent chat | The composer shows removable context chips and sends validated ids, source paths, geometry, and commit provenance through normal Trace messages. | Trace shell and `SessionService` |
| Canvas modes | Interact, Pan, Chat, Draw, Edit, and Generate have explicit, mutually understandable pointer behavior and shortcuts. | Trace mode state + tldraw tools |
| Drawing feedback | Brush, text, rectangle, arrow, and sticky note can be created, selected, moved, edited, deleted, refreshed, and attached to chat. | tldraw shapes + `DesignAnnotationService` |
| Deterministic visual edit | Edit mode selects rendered DOM and reuses Trace's shipped text/style editor, conflict hashes, commit, and event flow. | Existing manual editor |
| Side-by-side variants | Generate creates new manifest frames near the selected source with parent/lineage metadata and never removes the source by default. | Agent + managed repository |
| Frame actions | A selected frame exposes Focus, Export PNG, Build, and More actions. | Trace shell |
| Design-to-Build handoff | One or more selected screens can seed a new or existing App/Coding session at an explicit source commit. | `SessionService` |
| Durable recovery | Source, positions, annotations, exports, and handoffs survive refresh and another authorized client; ephemeral camera/hover state does not become an event. | Trace services and event store |

### P1 — Required follow-on parity

| Capability | Required Trace behavior |
| --- | --- |
| Contextual suggestions | Up to four selection-specific next steps feed the normal composer without bypassing permissions or cost disclosure. |
| Templates and References | A searchable drawer provides Trace-owned templates, user uploads, and existing project assets as agent context. |
| Library | Users can find and reuse eligible organization-owned Designs and generated projects. |
| Apply design system | Applying another immutable system creates a fork/variant and preserves the original. |
| Extract design system | Selected committed frames can start the existing validated design-system workbench flow. |

### Explicitly deferred

- Replit's third-party inspiration catalog or Mobbin integration.
- Standalone Image, Video, and Vector Graphic artifact generators.
- Multiplayer cursors and simultaneous freehand editing.
- Live App runtime frames on the same board.
- Pixel-identical Replit chrome, templates, suggestions, or visual assets.

### Parity release journey

The minimum end-to-end demonstration is:

```text
Open an existing Design
  -> its live screens render on the tldraw board
  -> select a frame, element, region, or annotation
  -> send that exact context to the Trace agent
  -> receive a side-by-side variant without losing the source
  -> annotate or deterministically edit the result
  -> export the selected frame or Build it into an implementation session
  -> refresh or open a second client and recover every durable change
```

## Trace Baseline and Gap Analysis

| Capability | Trace today | Canvas v2 decision |
| --- | --- | --- |
| Infinite board | Shipped inside the Design starter with hand-built pan, zoom, fit, sections, and artboards. | Replace the interaction engine with tldraw while preserving behavior. |
| Live design frames | Manifest-indexed React screens render in one Vite preview. | Render each screen through a custom tldraw shape in the same runtime and iframe. |
| Live updates | Agent file edits flow through HMR. | Keep HMR for source; use events only for Trace-owned entities. |
| Saved design | Commit-addressed self-contained HTML preview exists. | Keep as recovery and offline review state. |
| Direct visual edit | Element selection, DOM tree, deterministic text/style patching, optimistic preview, conflict hashes, commits, and events are shipped. | Present it as the canvas Edit mode instead of a separate-feeling feature. |
| Design systems | Immutable versions, workbench sessions, validation, storage, and Design pinning are shipped. | Add canvas actions for apply and extract while preserving version immutability. |
| Agent chat | Existing session chat sits beside the canvas. | Add structured selection context and suggestions to the existing composer. |
| Annotations | Not a first-class persistent Design entity. | Add event-backed annotations. |
| Variant lineage | Screens have variation/state metadata but no explicit parent lineage. | Add optional lineage metadata to the manifest. |
| Templates/references | Design systems and ordinary attachments exist, but no unified canvas drawer. | Add a scoped Templates, References, and Library drawer. |
| Build handoff | `attachDesignToSession` copies the whole committed Design into a target workspace. | Extend it to selected screens and expose a first-class Build action. |
| Export | Whole-canvas offline HTML is supported; saved commit HTML exists. | Keep HTML and add selected-frame PNG export. |

## Problem Statement

Trace can already generate and render sophisticated multi-screen designs, but the user
still controls most iteration through unscoped chat. The canvas is visually rich while
the interaction model around it is thin.

This creates five problems:

- Users must describe a target screen or element in prose even when it is visible.
- Drawing feedback cannot become durable, collaborative agent context.
- Direct editing feels separate from the main canvas workflow.
- Variant generation and comparison are possible but not discoverable or structured.
- Moving from a chosen screen to implementation is whole-design and service-oriented,
  rather than a clear product action on the selection.

## Goals

- Make every agent request targetable to a visible frame, element, region, or annotation.
- Let users switch naturally between using, navigating, annotating, directly editing,
  and generating from the canvas.
- Make side-by-side variants a first-class, lineage-preserving workflow.
- Preserve Trace's service/event architecture for meaningful mutations.
- Reuse the current Design starter, manual editor, managed repo, preview, design-system,
  and session infrastructure.
- Adopt tldraw's maintained canvas primitives instead of expanding Trace's custom camera,
  selection, drawing, geometry, and undo implementations.
- Make a selected design immediately useful outside Design through export or Build.
- Keep generated content isolated from the Trace application origin.

## Non-Goals

- Building a general-purpose Figma replacement.
- Adding arbitrary vector path editing, constraints, auto-layout authoring, or reusable
  component authoring directly on the board.
- Creating one runtime, process, endpoint, or iframe per screen.
- Adopting tldraw sync, tldraw.com storage, or tldraw multiplayer as Trace's shared-state
  backend in v1.
- Treating a raw tldraw store snapshot as the durable source of Design screens or business
  entities.
- Forking or patching tldraw internals when a supported custom shape, tool, binding, or UI
  override can deliver the requirement.
- Persisting pan, zoom, hover, or private selection as organization events.
- Shipping a licensed third-party inspiration catalog in v1.
- Shipping image, video, or vector generation as separate Trace artifact types in v1.
- Multiplayer cursors or simultaneous freehand drawing in v1.
- Applying an uncommitted design directly to production code without a reviewable agent
  task and managed Git checkpoint.
- Changing the existing immutable design-system version contract.

## Primary Users and Jobs

### Product designer or founder

> Show me several credible directions, let me point at what is wrong, and help me refine
> one direction without translating visual feedback into developer language.

### Product engineer

> Let me inspect the exact screen and source context, make deterministic fixes quickly,
> and turn the chosen direction into implementation-ready work.

### Agent

> Give me stable screen, element, region, annotation, and lineage identifiers so I can
> make narrow changes and explain what I changed.

## Product Principles

- **Selection is the shared language.** All contextual actions use the same selection.
- **Direct edits are deterministic.** Simple text and style changes do not require a model.
- **Complex changes are agent tasks.** Generation and structural edits go through the
  existing session and managed workspace.
- **Source stays reviewable.** The managed Git tree and `design.canvas.json` remain the
  durable source of truth.
- **tldraw is the engine, not the product model.** Trace uses public SDK primitives for
  canvas mechanics while its service layer and event log own durable product actions.
- **Meaningful collaboration is event-backed.** Annotations, exports, and handoffs are
  service actions with events; viewport movement and hover are not.
- **Variants do not destroy their source.** Reimagine creates sibling or child frames by
  default.
- **Design-to-build is explicit.** The user chooses which frames and target session to
  implement.

## Terminology

- **Canvas** — the tldraw-powered infinite spatial board rendered by the Design starter.
- **Section** — a named group of screens described in `design.canvas.json`.
- **Frame** — one manifest-indexed screen/artboard with a stable id and viewport.
- **Element** — a DOM element in a frame, preferably with `data-trace-id` source metadata.
- **Region** — a normalized rectangular selection inside a frame.
- **Annotation** — a persistent brush stroke, text label, rectangle, arrow, or sticky note.
- **Design context** — structured selection metadata attached to a Trace message.
- **Variant** — a frame derived from another frame while preserving the source frame.
- **Suggestion** — an agent-authored, selection-specific next-step prompt.
- **Build handoff** — copying selected committed Design source into an App or Coding
  workspace and starting an implementation task.

## Product Experience

### Entry and initial generation

The existing New Design flow remains prompt-first. The user may optionally choose a
published design-system version before the first prompt. Trace opens the ordinary
ProjectPreviewWorkspace:

```text
+---------------------------+--------------------------------------------------+
| Trace chat                | Design canvas                                    |
|                           |                                                  |
| Conversation              |     Section: Current                             |
| Agent progress            |     [ Frame A ]  [ Frame B ]  [ Frame C ]        |
| Questions                 |                                                  |
| Context chips             |                selection actions                 |
| Composer                  |                                                  |
|                           |      [Interact Pan Chat Draw Edit Generate]       |
+---------------------------+--------------------------------------------------+
```

The global sidebar continues to auto-collapse when the canvas becomes available. The
user can restore it manually.

### Canvas navigation and selection

- Trackpad/wheel pans the board; pinch or modifier-wheel zooms.
- Fit shows all frames; Focus shows the active frame or multi-selection.
- Interact mode passes pointer input into a frame.
- Pan mode always moves the board and never activates frame content.
- Clicking frame chrome selects one frame.
- Shift-click adds or removes frames from a multi-selection.
- Escape clears the most specific selection: element/region first, then frame selection.
- Selection is local UI state until it is used in a message or mutation.
- The selected frame shows a compact action bar with title, Export PNG, Build, Focus, and
  More.

### Contextual chat

Chat mode turns visual scope into message context:

- click a frame to select the whole frame;
- click a marked element to select that element;
- drag inside one frame to select a normalized region;
- select one or more existing annotations;
- combine up to 16 frames/annotations in one request.

The existing Trace composer shows removable context chips above the text input. Examples:

```text
[Dashboard / Empty state] [button#invite] [2 annotations]
Make the empty state more useful and emphasize the invite action.
```

Sending produces the ordinary `message_sent` event with an additional validated design
context payload. The agent receives human-readable context plus stable ids and source
paths. Other clients can render the same chips from the event.

Region selection is a source hint, not a bitmap-editing contract. The canvas runtime
reports intersecting `data-trace-id` elements when possible. The context also includes
the normalized rectangle so the agent can reason about otherwise unmarked decoration.

### Draw and annotate

Draw mode exposes tldraw's supported built-in shape/tool primitives behind Trace-owned
toolbar labels and semantic colors:

- brush;
- text;
- rectangle;
- arrow;
- sticky note;
- the existing semantic annotation color palette.

Annotations may be anchored to the board or to a frame. Frame-anchored geometry uses
normalized frame coordinates so it remains correct when the frame moves or the board
zooms.

New annotations render optimistically. The service-created event reconciles the client
id and makes the annotation visible after refresh and to other organization members.
Annotations can be selected, moved, edited, deleted, or attached to a message.

Trace translates the supported tldraw records into bounded `DesignAnnotation` inputs before
persistence. Freehand input is simplified and capped before it leaves the runtime. Trace is
not a high-fidelity illustration tool, and arbitrary third-party/custom shape JSON is not
accepted by the service.

### Direct Edit mode

Edit mode reuses the shipped manual Design editor:

- the chat rail becomes `DesignManualEditPanel`;
- the preview handshake enables element discovery and selection;
- text and supported styles preview immediately through `postMessage`;
- changes remain draft-local until Done;
- Done uses the existing hash-checked batch save and managed Git commit;
- Discard restores the last saved source;
- navigation protection continues to prevent accidental loss of drafts.

Canvas v2 changes the entry point and framing, not the deterministic edit architecture.
The mode toolbar should make Edit feel like one canvas capability beside Chat and Draw.

If an element cannot be changed deterministically, the panel offers **Ask agent**. This
exits Edit mode, keeps the element as composer context, and focuses the normal composer.

### Generate and suggestions

Generate mode is scoped to capabilities Trace can complete:

- **Design variant** — create one or more derived frames beside the selected frame.
- **Explore approaches** — ask for several meaningfully different directions.
- **Add state** — add loading, empty, error, success, or another named state.
- **Add viewport** — add mobile, tablet, or desktop versions.
- **Build from selection** — open the Build handoff.

Image, video, and vector output types remain hidden until Trace has corresponding
artifact contracts and adapters. The menu must not contain dead ends.

After a successful generation checkpoint, the agent may publish up to four contextual
suggestions for each changed frame. A suggestion has a short action label, one-sentence
description, and the exact prompt to send. Clicking a suggestion populates the existing
composer with the source frame already attached. It does not bypass chat, credit
disclosure, agent permissions, or review.

### Variant lineage

- A variant records `parentScreenId` and `lineageGroupId` in the manifest.
- Reimagine and Explore create new frames rather than overwriting the source by default.
- A narrow Refine request may edit the selected frame in place when the user explicitly
  asks for an update rather than a comparison.
- The canvas places new variants near their parent unless the agent supplies a position.
- The frame action bar can move between members of a lineage group.
- Removing a variant does not remove its parent or siblings.

### Templates, References, and Library drawer

Canvas v2 uses one right-side drawer with three tabs:

#### Templates

- Curated Trace-owned starting points packaged with stable ids, thumbnails, categories,
  supported viewports, and license metadata.
- Initial categories: product screen, landing page, mobile flow, dashboard, and form flow.
- Selecting a template attaches it as agent context and offers **Use as starting point**.
- A template is never inserted by executing untrusted remote code in the Trace origin.

#### References

- Images and screenshots uploaded to the current Design through the existing attachment
  pipeline.
- Links or imported screenshots explicitly added by the user.
- Reference cards can be placed on the board or attached to the composer.
- A third-party inspiration catalog is a future, licensed integration—not an MVP
  requirement.

#### Library

- The pinned design-system version and its tokens/components.
- Other Designs and generated projects the user can view in the active organization.
- Assets already generated or uploaded in this Design.
- Long lists must be virtualized and filtered without broad Zustand subscriptions.

### Design-system actions

The selected frame's More menu includes:

- **View design system** — open the pinned immutable system/version.
- **Apply another design system** — create a Design fork or variant branch pinned to the
  selected immutable version; preserve the original Design and source commit.
- **Extract design system** — create a `design_system` authoring session using the
  selected committed Design source as provenance.

Extraction is an agent task and may consume credits. It must disclose that fact before
start. A valid workbench commit still passes the existing package validation and immutable
version publication pipeline. Selecting Extract never applies the result back to screens
automatically.

### Build handoff

Build is available for one or more selected frames:

1. Resolve the Design's current committed source SHA.
2. Ask whether to create a new App/Coding session or choose an eligible existing session.
3. Copy only the selected screens, their transitive local design dependencies, the
   relevant manifest subset, design brief, tokens, and handoff metadata under
   `.trace/designs/<slug>/`.
4. Send the target agent a normal message with the selected screen ids, source commit,
   viewport/state metadata, and implementation request.
5. Show the resulting link in both the Design and target session event streams.

This extends `attachDesignToSession`; it does not create a separate delivery system.
Whole-Design attachment remains available when nothing is selected.

### Export

Canvas v2 exposes:

- **Export PNG** for a selected frame;
- **Export HTML** for the whole self-contained interactive canvas, using the existing
  export path;
- **Copy link** to the current Trace Design when visibility permits.

PNG export is commit-addressed and server-owned. The export service renders the selected
frame at its manifest viewport, waits for fonts and the artboard readiness signal, blocks
external network access, validates PNG bytes, uploads the result, and emits completion.
Although tldraw provides image-export primitives, server rendering remains authoritative
because a `trace-screen` shape contains live custom DOM whose fonts, assets, and runtime
readiness must be captured consistently.
The first release does not promise region export, arbitrary scale factors, or unsaved
manual-edit export.

### Saved state and recovery

- Live source continues through the managed workspace and HMR.
- Managed Git remains the durable source.
- Saved Design previews remain self-contained, commit-addressed HTML.
- Annotations remain available when the runtime is paused because they are Trace entities,
  not only DOM inside the preview.
- Saved previews support Interact/Pan/Focus and viewing annotations.
- Edit, Generate, and unsaved annotation changes require a writable live runtime.

## Functional Requirements

### FR-0 — Runtime migration

- New Design workspaces must be seeded with the pinned tldraw runtime and an explicit
  runtime-version marker.
- Existing Design workspaces must use `DesignRuntimeUpgradeService`; opening a Design must
  never overwrite user-owned screen, manifest, brief, token, or asset files.
- Unmodified legacy scaffolds must be upgradeable in one verified managed commit. Modified
  scaffolds must stop for an agent-assisted, reviewable migration.
- The server must support an organization/session rollout flag that controls new-workspace
  seeding and legacy upgrade eligibility independently.
- Disabling the rollout flag must stop additional migrations without making already-upgraded
  Designs unreadable or requiring a downgrade.
- Legacy saved previews and commits must remain viewable after the live workspace upgrades.

### FR-1 — Canvas shell and modes

- The Design starter must use the pinned `tldraw` package as its camera, selection,
  hit-testing, drawing, snapping, and undo/redo engine.
- The Design workspace must render a single mode toolbar with Interact, Pan, Chat, Draw,
  Edit, and Generate.
- Trace-owned controls must use supported tldraw UI overrides and Editor APIs rather than
  DOM queries or patches against tldraw internals.
- Keyboard shortcuts must be discoverable and must not fire while typing in the composer
  or editor fields.
- The current mode is local Zustand state and is not a shared event.
- Reload defaults to Interact unless an unsaved manual-edit recovery state requires Edit.

### FR-2 — Selection

- The runtime must report frame, element, region, and annotation selections through a
  versioned, validated bridge.
- The Trace shell must support one primary selection and multi-frame/annotation selection.
- Selection must use stable manifest screen ids and `data-trace-id` element ids.
- The composer must show removable, accessible context chips.
- A missing or stale selection must fail clearly and remain removable; it must not target
  a different element heuristically.

### FR-3 — Agent context

- `sendSessionMessage` must accept optional structured Design context.
- The service must validate access, ids, count, string lengths, geometry, and payload size.
- The event payload must contain enough normalized context for all clients to render the
  sent message without a refetch.
- The delivered agent prompt must identify the Design, source commit/branch head, screen
  ids, component paths, viewports, states, elements, regions, and annotations.
- The agent must read the current manifest/source before editing and must make narrow
  changes when the selection is narrow.

### FR-4 — Annotations

- Create, update, and delete must be service methods.
- Every mutation must append and broadcast an event containing the full annotation entity
  or its tombstone.
- The client must optimistically render creates and reconcile from the event.
- Every persisted annotation must have a stable Trace id and deterministic runtime tldraw
  shape id so event reconciliation cannot duplicate it.
- Only an allowlisted subset of tldraw shape properties may cross the preview bridge.
- Annotations must survive reload, runtime pause, and another client opening the Design.
- Geometry and point counts must be bounded.

### FR-5 — Direct editing

- Edit mode must reuse the shipped manual editor store, preview bridge, hash validation,
  source patching, managed commit, and `manual_element_saved` event.
- Saving multiple edited elements must remain one batch commit.
- Source conflicts must preserve the draft and ask the user to reselect before retrying.
- Unsupported edits must be convertible into an agent request with element context.

### FR-6 — Variants and suggestions

- The manifest must support optional parent and lineage metadata.
- Variant generation must preserve the parent unless overwrite is explicit.
- Suggestions must be optional, selection-specific, committed with the Design, and capped
  at four per frame.
- Clicking a suggestion must populate or send through the normal composer path; it must
  not invoke a hidden mutation.

### FR-7 — Templates and references

- Template metadata must come from a trusted Trace registry with license attribution.
- References must reuse the existing upload authorization and storage adapters.
- Drawer state is local; adding a reference to the Design is a service mutation/event or
  an ordinary message attachment.
- Template and reference lists must support search and category filters.

### FR-8 — Design systems

- The existing Design remains pinned to its immutable `designSystemVersionId`.
- Applying another system must preserve the original through a fork/variant workflow.
- Extraction must create a normal `design_system` workbench and use existing validation,
  managed Git, commit artifact, storage, and publication contracts.

### FR-9 — Build handoff

- Build must support selected screen ids and an explicit source commit SHA.
- The target workspace copy must include only allowed text/binary source paths and preserve
  UTF-8/binary integrity.
- The target message and source files must arrive before the agent begins implementation.
- The handoff must create a durable link/event visible from both source and target.
- Existing whole-Design `attachDesignToSession` behavior must remain compatible.

### FR-10 — Export

- Export PNG must be asynchronous, bounded, commit-addressed, and event-backed.
- Completion must be emitted only after valid non-empty PNG bytes are stored.
- Exported content must not receive Trace cookies or unrestricted network access.
- Existing whole-canvas offline HTML export must not regress.

### FR-11 — Accessibility and responsive behavior

- Mode controls and frame actions must have accessible names and keyboard focus states.
- Color may not be the only annotation or selection signal.
- Reduced-motion preferences must disable nonessential transitions.
- On mobile, chat and canvas remain horizontally pageable as in the existing workspace;
  Draw and direct Edit may be limited to larger viewports in v1 with clear messaging.

## Architecture and Data Ownership

### Source of truth by concern

| Concern | Source of truth |
| --- | --- |
| Screen React source | Managed Git working tree and commits |
| Screen membership, section, viewport, position, lineage | `design.canvas.json` |
| Live source updates | Vite HMR inside the isolated preview |
| Runtime shape projection, camera, undo/redo, canvas hover/selection | In-memory tldraw store inside the preview runtime |
| Saved canvas preview | Existing commit-addressed HTML object |
| Design-system package | Immutable `DesignSystemVersion` object |
| Annotations | Postgres entity projected through events |
| Sent visual context | Immutable `message_sent` event payload |
| Trace mode intent, composer context selection, drawer, focus | Local Zustand UI state |
| PNG export | Storage object plus event-backed `DesignFrameExport` record/status |
| Build handoff | Source/target link plus message event and copied committed files |

Canvas v2 intentionally does not create database rows for every screen or section. Those
remain manifest-derived until Trace needs organization-wide screen search, independent
screen permissions, or screen-level publishing.

### tldraw integration boundary

#### Package and runtime placement

- Add the published `tldraw` package and `tldraw/tldraw.css` to
  `apps/container-bridge/design-starter`; pin an exact reviewed version in the lockfile.
- Keep `<Tldraw />` inside the existing Vite Design application served from the isolated
  preview/user-content origin. Do not mount tldraw in the privileged Trace shell.
- Remove the starter's custom camera, wheel/pinch, hit-testing, selection, and drawing code
  after behavior parity is verified. Keep Trace-specific manifest validation, screen
  resolution, error boundaries, export support, and preview bridge code.
- Use the supported tldraw `Editor` API, custom `ShapeUtil`s, tools, bindings, event hooks,
  and UI overrides only. No selectors against private DOM structure and no imports from
  undocumented internal package paths.

The tldraw repository version reviewed for this PRD was `5.2.5`. Its package metadata
supports React `^18.2.0` or `^19.2.1`; the current Design starter declares a range beginning
at React `19.0.0`. The adoption spike must ensure the resolved React and React DOM versions
are a supported pair, raise the declared floor if necessary, and confirm the container Node
runtime against the selected tldraw release before the dependency is merged.

#### Custom screen shape

Create one Trace-owned custom shape type, provisionally `trace-screen`, backed by a
`TraceScreenShapeUtil`:

```text
TraceScreenShape props
  screenId
  width
  height
  componentKey
  viewportKind?
  state?
```

- The shape id is deterministically derived from the stable manifest screen id.
- The shape renderer resolves the existing React screen module and renders it through a
  tldraw `HTMLContainer`, preserving `ArtboardErrorBoundary` and source metadata.
- The ShapeUtil defines exact rectangular geometry, selection bounds, frame title/chrome,
  and whether resize/rotation are allowed.
- Rotation is disabled. Screen movement is supported. Arbitrary resizing is disabled in
  the first release so moving a frame cannot silently change its manifest viewport.
- Interact mode enables pointer events inside the rendered screen. Pan, Chat, Draw, and
  Edit modes gate or reinterpret pointer events through explicit tldraw tools/state rather
  than CSS timing hacks.
- Section labels are derived, non-editable shapes or canvas overlays keyed by manifest
  section id. They are never independent durable entities.

#### Store reconciliation and persistence

The tldraw store is a runtime projection, not a competing source of truth:

```text
design.canvas.json --------> trace-screen shapes
Trace annotation events ---> supported tldraw annotation shapes
tldraw interaction --------> validated intent through preview bridge
Trace service/event --------> authoritative reconciliation back into tldraw
```

- On startup and HMR, reconcile manifest screens by deterministic shape id: create missing
  screen shapes, update changed metadata/geometry, and remove only screen shapes whose
  manifest entries were removed.
- Manifest reconciliation must never overwrite user annotation shapes or tldraw camera and
  private-selection state.
- Annotation events are normalized into the supported tldraw draw, text, geo, arrow, and
  note shapes. Raw store snapshots and unknown records never cross into shared state.
- Frame-anchored annotation shapes use tldraw parent/child geometry relative to the matching
  screen shape at runtime; the service representation remains normalized screen coordinates
  so it does not depend on a vendor record schema.
- tldraw history may power local undo/redo. A durable undo is still a normal Trace service
  action and event; local history cannot rewrite organization history.
- Moving one or more screen shapes is optimistic. On interaction end, the runtime sends one
  bounded layout intent to the shell. A Trace service validates it, updates
  `design.canvas.json` in the managed workspace, creates one managed commit/event, and the
  resulting manifest/event reconciles the runtime. Failure restores the manifest position.
- Camera position, current tool, hover, private selection, and unfinished strokes remain
  ephemeral. Trace does not configure `@tldraw/sync` in v1.

#### License and vendor governance

The tldraw SDK uses the repository's custom tldraw license, not MIT. Development use is
permitted by that license, while a production deployment requires an issued license key or
separate commercial agreement. Therefore:

- a commercial license and approved production key are a release gate, not an engineering
  follow-up;
- Legal/Security must review the commercial terms, required notices, technical enforcement,
  watermark behavior, and the license's disclosed usage-data transmission;
- the key must be configured through tldraw's supported deployment mechanism and scoped to
  Trace environments; no other Trace credentials enter the preview;
- upgrades are deliberate dependency changes with release-note, license, bundle, browser,
  export, and migration review;
- Trace keeps the tldraw integration behind a small runtime boundary so the rest of the
  product does not depend on vendor-specific record types.

### Current-to-tldraw migration map

The migration replaces the starter's canvas mechanics while preserving its product-specific
contracts. The intended code transition is:

| Current starter responsibility | Canvas v2 replacement | Disposition |
| --- | --- | --- |
| `DesignCanvas.tsx` composition | `TldrawDesignCanvas` composition | Replace after parity |
| `useCanvasViewport.ts` and `viewport.ts` | tldraw camera and input handling | Remove after parity |
| `DesignArtboard.tsx` | `TraceScreenShapeUtil` renderer using `HTMLContainer` | Adapt and preserve error boundary |
| `CanvasToolbar.tsx` zoom/fit controls | Trace toolbar commands sent to tldraw `Editor` | Replace UI wiring |
| `layout.ts` initial placement | Manifest position migration and fallback placement | Retain only deterministic fallback logic |
| `manifest.ts` parsing | Backward-compatible manifest v1/v2 parser and shape projection | Extend |
| `screen-modules.ts` | Screen component resolver used by the custom shape | Retain |
| Manual editor bridge | Versioned Canvas v2 bridge with tldraw selection integration | Extend |
| Whole-canvas HTML export | tldraw-aware offline build/export path | Preserve behavior |

Expected new runtime boundaries, with one component per file, are:

- `TldrawDesignCanvas.tsx` — mounts the editor and composes runtime capabilities;
- `TraceScreenShapeUtil.tsx` — renders and measures live manifest screens;
- `TraceCanvasToolbar.tsx` — runtime-owned controls for offline/saved preview use;
- `reconcileDesignCanvas.ts` — pure manifest/event-to-store reconciliation;
- `designAnnotationCodec.ts` — allowlisted Trace entity ↔ tldraw shape conversion;
- `designCanvasBridge.ts` — validates and emits the versioned shell protocol;
- focused tools for Interact, Chat-region selection, and Edit-element selection.

No tldraw types may leak into GraphQL schema types, Prisma models, service inputs/events,
or the shared Zustand entity store. Conversion happens at the preview-runtime boundary.

### Existing Design workspace migration

New Designs receive the tldraw starter immediately, but existing Designs contain a committed
copy of the older canvas scaffold. Updating only `apps/container-bridge/design-starter`
would not migrate them. Canvas v2 therefore requires a versioned runtime-upgrade contract.

Add `.trace/design-runtime.json` to new and upgraded Designs:

```json
{
  "schemaVersion": 1,
  "engine": "tldraw",
  "runtimeVersion": 2
}
```

Add a `DesignRuntimeUpgradeService` with one action:

```text
upgradeDesignRuntime(sessionGroupId, expectedCommitSha, targetRuntimeVersion, actor)
```

The service must:

1. Authorize access and resolve the exact managed repository and expected head commit.
2. Detect the legacy starter using known file fingerprints or the runtime marker; never
   infer eligibility from client-provided paths.
3. Replace only Trace-owned scaffold paths such as `src/canvas/**`, required root runtime
   entry/configuration files, package metadata, and the lockfile.
4. Never overwrite `src/design/**`, `design.canvas.json`, `design.brief.json`,
   `trace.tokens.json`, user assets, or unrelated files.
5. Preserve manifest v1 behavior through the new backward-compatible parser; a manifest v2
   rewrite occurs only when a v2 capability is first used.
6. Install from the pinned lockfile, run the starter typecheck/tests/build, and create one
   managed upgrade commit only after verification succeeds.
7. Append and broadcast `design_runtime_upgraded` with the previous version, target version,
   commit SHA, and complete normalized Design projection needed by clients.
8. Leave the working tree and branch unchanged on failure and surface an actionable error.

If a legacy Design modified Trace-owned scaffold files, automatic replacement must stop.
The user can start an agent-assisted migration that shows the conflicting paths and creates
a reviewable commit; Trace must not silently discard those changes. Previously saved,
commit-addressed HTML previews remain viewable with their original runtime. Rolling back the
upgrade means reverting the managed upgrade commit, not applying a hidden runtime downgrade.

Live-session startup checks the runtime marker before launching Vite. Eligible unmodified
legacy workspaces may be upgraded through the service as part of the user-requested session
start; modified or failed workspaces show an Upgrade required state rather than a broken
canvas. New and upgraded Designs share the same runtime-version test matrix.

### Manifest v2

The starter should accept the current v1 manifest and add a v2 migration/validator. The
minimum v2 additions are optional section descriptions and screen lineage:

```json
{
  "version": 2,
  "sections": [
    {
      "id": "exploration",
      "name": "Exploration",
      "description": "Three directions derived from the current dashboard.",
      "screenIds": ["dashboard-a", "dashboard-b", "dashboard-c"]
    }
  ],
  "screens": [
    {
      "id": "dashboard-b",
      "name": "Dashboard · Dense",
      "component": "./screens/dashboard-b.tsx",
      "variation": "Dense",
      "state": "Default",
      "viewport": { "width": 1440, "height": 1000 },
      "position": { "x": 1540, "y": 0 },
      "parentScreenId": "dashboard-a",
      "lineageGroupId": "dashboard-directions"
    }
  ]
}
```

Validation requirements from v1 continue: stable unique ids, constrained component paths,
valid section membership, finite geometry, existing components, and visible failure for
unknown versions. Parent ids must exist, a screen cannot parent itself, and parent cycles
must fail validation.

### Suggestions file

Agent-authored suggestions should be separate from the structural manifest:

```json
{
  "version": 1,
  "suggestions": [
    {
      "id": "tighten-hierarchy",
      "screenId": "dashboard-b",
      "action": "Refine",
      "label": "Tighten the table hierarchy",
      "prompt": "Refine the selected dashboard by tightening table hierarchy and row actions."
    }
  ]
}
```

The file is optional, committed, validated, and never executed as code.

### New DesignAnnotation entity

`DesignAnnotation` is a flat organization-scoped peer entity linked to a Design session
group, not a nested event-only object:

```text
id
organizationId
sessionGroupId
screenId?             # null for board-level annotation
kind                  # brush | text | rectangle | arrow | sticky
geometry              # bounded JSON; normalized for screen anchors
style                 # bounded semantic color/width JSON
text?
createdById
createdAt
updatedAt
deletedAt?
```

Brush geometry is simplified client-side and capped. Text is plain text with length
limits. Style values come from an allowlist rather than arbitrary CSS.

### New DesignFrameExport entity

Each asynchronous PNG request has a flat organization-scoped record so the result can be
recovered after refresh and rendered from events without inspecting a mutation result:

```text
id
organizationId
sessionGroupId
screenId
commitSha
status                # pending | rendering | completed | failed
storageKey?
contentType?
byteSize?
width?
height?
error?
requestedById
createdAt
completedAt?
```

The record never stores PNG bytes. The existing storage adapter owns the binary. Export
events contain the full normalized record so Zustand can upsert it directly.

### Design prompt context

Add schema-owned input types rather than passing an unvalidated generic JSON blob:

```text
DesignPromptContextInput
  sourceCommitSha?
  selections: [DesignSelectionInput!]!
  annotationIds: [ID!]

DesignSelectionInput
  kind: frame | element | region
  screenId: String!
  elementId?
  filePath?
  rect?                # normalized x/y/width/height
```

The server writes normalized context into the `message_sent` payload and delivery command.
It must not trust source paths supplied by the preview without applying the existing
Design source-path restrictions.

### Events

Add only events that represent durable shared changes:

- `design_annotation_created`
- `design_annotation_updated`
- `design_annotation_deleted`
- `design_canvas_layout_updated`
- `design_runtime_upgraded`
- `design_frame_export_requested`
- `design_frame_export_completed`
- `design_frame_export_failed`
- `design_implementation_requested`

Normal agent requests remain `message_sent`; their design context is part of the message
payload. Manual edit saves remain `manual_element_saved`. Managed Git/checkpoint/preview
events continue to represent source and saved preview changes.

Do not emit events for mode changes, viewport changes, hover, private selection, opening a
drawer, or viewing a suggestion.

## Preview Bridge

Canvas v2 extends the existing manual-edit handshake into a versioned protocol. All
messages must validate exact origin, source window, protocol version, type, size, and
payload shape.

### Runtime to Trace shell

- `trace:design:canvas-ready`
- `trace:design:manifest`
- `trace:design:selection-changed`
- `trace:design:region-selected`
- `trace:design:annotation-draft`
- `trace:design:layout-intent`
- existing manual editor ready/selection/DOM-tree messages

### Trace shell to runtime

- `trace:design:set-mode`
- `trace:design:set-selection`
- `trace:design:focus-selection`
- `trace:design:annotations-replace`
- `trace:design:annotation-upsert`
- `trace:design:annotation-remove`
- `trace:design:layout-reconcile`
- existing manual text/style preview and element-selection messages

The iframe never receives GraphQL credentials, storage credentials, organization events,
or a general RPC capability. The Trace shell remains the only caller of services.

## Service Layer

### SessionService extensions

- Accept validated Design context on `sendSessionMessage`.
- Resolve current Design group, managed repo, branch head/preview commit, manifest entries,
  and allowed source paths.
- Add human-readable context to the agent prompt without duplicating the entire source.
- Extend `attachDesignToSession` with optional selected screen ids and source commit.

### DesignAnnotationService

- `list(sessionGroupId)`
- `create(input, actor)`
- `update(id, patch, actor)`
- `delete(id, actor)`
- Authorize through the Design session group's organization/visibility/write access.
- Append events with full entities/tombstones and broadcast through the existing broker.

### DesignCanvasLayoutService

- `updateScreenPositions({ sessionGroupId, expectedCommitSha, positions }, actor)`
- Validate Design access, stable screen ids, finite/capped coordinates, batch size, expected
  commit, and manifest version.
- Update only matching screen positions in `design.canvas.json` through the managed workspace.
- Create one checkpoint/commit and append `design_canvas_layout_updated` with the complete
  affected screen-position projection.
- Reject stale commits without rebasing a drag onto different manifest content.

### DesignRuntimeUpgradeService

- Implement the versioned upgrade action and file-ownership rules defined under Existing
  Design workspace migration.
- Run all dependency installation and verification within the existing bounded workspace
  execution path.
- Produce no commit or event until the upgraded runtime passes its required checks.
- Expose normalized upgrade state through the ordinary Design/session entity projection;
  GraphQL, if exposed, remains a thin service wrapper.

### DesignFrameExportService

- `requestPng({ sessionGroupId, screenId, commitSha? }, actor)`
- Resolve and validate the exact manifest screen at the exact commit.
- Render with a bounded isolated browser worker and no Trace credentials.
- Validate PNG signature, dimensions, byte limits, and storage completion.
- Emit requested/completed/failed events.
- Reuse existing storage adapters and preview/export security boundaries.

### DesignTemplateService

- Read-only list/get methods for trusted packaged template metadata.
- No arbitrary remote template execution.
- Applying a template is an ordinary agent request with structured template context in v1.

GraphQL resolvers remain thin wrappers around these services. Agent runtime capabilities
call the same services directly where applicable.

## Frontend State and Components

### Shared event-backed state

- Add `designAnnotations` and frame-export status entities to the client-core entity store.
- Register event handlers that upsert full entities without refetching.
- Keep mutation results out of shared state.
- Use fine-grained entity selectors from components.

### Local canvas state

Add a dedicated Zustand canvas UI store for:

- active mode;
- runtime-ready state and protocol version;
- current manifest projection;
- primary and multi-selection;
- draft annotation geometry;
- drawer tab/filter state;
- focus state.

This is local UI/derived preview state, not a second shared-state system. tldraw's internal
store remains encapsulated inside the preview runtime. The Trace shell does not mirror the
whole store into Zustand; it projects only the active mode, readiness, selection, manifest,
and service-backed entities that the surrounding product needs.

### Expected UI component boundaries

- `DesignCanvasToolbar`
- `DesignCanvasSelectionBar`
- `DesignContextChips`
- `DesignAnnotationTools`
- `DesignGenerateMenu`
- `DesignSuggestions`
- `DesignLibraryDrawer`
- `DesignBuildDialog`
- `DesignExportMenu`

Each component should remain focused and live in the existing session/application UI tree.
Use shadcn primitives, semantic Tailwind tokens, fine-grained Zustand selectors, and
framer-motion only for purposeful drawer/selection transitions.

## Security and Limits

- Generated Design source remains isolated in the existing preview/user-content origin.
- tldraw runs only in that isolated runtime; it receives no GraphQL session, storage key,
  repository credential, or general service capability.
- Preview bridge messages are allowlisted, schema-validated, origin-checked, and size-capped.
- Only allowlisted tldraw shape kinds and normalized props may cross the bridge; raw store
  snapshots, assets with arbitrary URLs, embeds, and executable records are rejected.
- Element source paths must pass existing `src/design/**/*.tsx` restrictions.
- Annotation geometry, brush points, text, update frequency, and entity counts are capped.
- Reference uploads use existing file authorization, scanning, storage, and content limits.
- Templates are trusted packaged assets with license metadata.
- PNG rendering blocks external network access and never receives Trace cookies.
- Build handoff reads from a resolved allowed commit, not arbitrary client file paths.
- Manual editing keeps optimistic concurrency hashes and rollback behavior.
- Applying/extracting design systems respects existing repository and Design visibility.

Initial limits:

- 16 selected frames/annotations per message;
- 500 annotations per Design;
- 2,000 characters per text/sticky annotation;
- 2,000 simplified points per brush annotation;
- 10 MB serialized annotation payload per Design;
- four active suggestions per frame;
- one concurrent PNG export per user and two per organization, configurable server-side.

## Performance and Reliability Budgets

Use a checked-in reference Design containing 24 mixed desktop/mobile screens, no more than
eight simultaneously visible live frames, and 200 mixed annotations. On the agreed desktop
reference environment:

- after Vite reports ready, the board must become interactive within two seconds at p95;
- pan and zoom must keep p95 input-to-next-paint below 32 ms while the reference viewport is
  moving;
- tldraw or the custom shape must cull or suspend live screen DOM outside a bounded viewport
  overscan area;
- switching tools or selecting an existing shape must respond within 100 ms at p95;
- an HMR screen update must not remount the tldraw editor or clear the camera, annotations,
  or still-valid selection;
- a failed annotation/layout mutation must restore authoritative state without duplicating
  or losing another accepted change;
- repeated open, HMR, focus, and mode-switch cycles must not show unbounded listener, DOM,
  or memory growth in the browser regression test.

Mobile/touch testing uses a smaller fixture and must preserve functional correctness even
where Draw or Edit is intentionally unavailable. Performance thresholds may be recalibrated
once during Phase 0 from measured baseline hardware, then require an explicit PRD update.

## Success Metrics

Primary:

- percentage of Design follow-up prompts sent with frame/element/annotation context;
- median time from first frame visible to first targeted iteration;
- percentage of Designs that produce at least two compared variants;
- percentage of Designs that invoke Build with selected frames;
- successful Build handoff rate.

Quality and safety:

- legacy runtime upgrade success, refusal, and rollback rate;
- percentage of eligible existing Designs upgraded without user-source diffs;
- direct-edit save success and conflict rate;
- agent change acceptance rate after a targeted prompt;
- annotation-to-prompt conversion rate;
- PNG export success and latency;
- stale selection/context rejection rate;
- preview bridge validation failures;
- regression rate for existing App, PDF, Animation, Coding, and Design workflows.

## Rollout

### Phase 0 — tldraw foundation and parity gate

- Execute the tldraw commercial agreement and configure a production license key.
- Pin the SDK and align supported React, React DOM, Node, CSP, and build/runtime versions.
- Implement `TraceScreenShapeUtil`, manifest-to-store reconciliation, and existing artboard
  error/readiness behavior inside tldraw.
- Add the runtime marker, upgrade service, legacy fingerprints, rollout flags, and fixture
  corpus for new and existing Designs.
- Replace custom camera/gesture code and prove parity for pan, zoom, fit, HMR, live screen
  interaction, saved preview, and whole-canvas HTML export.
- Prove that no tldraw sync or hosted storage path is active and document any required
  license-validation/telemetry network behavior.

### Phase 1 — Selection-aware core

- Versioned preview bridge.
- Interact, Pan, Chat, and Edit modes.
- Frame/element/region selection and composer context chips.
- Optimistic tldraw screen movement with service-owned manifest persistence.
- Structured design context on messages.
- Variant lineage manifest v2 with v1 compatibility.
- Selected-screen Build handoff.

### Phase 2 — Persistent feedback and export

- Draw mode and DesignAnnotation service/events/store.
- Annotation selection in messages.
- Selected-frame PNG export.
- Saved-preview annotation display.

### Phase 3 — Follow-on parity: suggestions, starting points, and systems

- Contextual suggestions.
- Templates, References, and Library drawer.
- Design fork/apply-system flow.
- Extract design system from selected committed frames.
- Organization-level Design/library search.

### Later

- Live App preview frames on the same board.
- First-class image/video/vector artifacts.
- Licensed inspiration provider.
- Multiplayer presence and cursors.
- Database-backed screen entities when independent screen permissions/search/publishing
  justify them.

### Release gates

1. **Vendor and feasibility gate** — commercial terms are approved; the pinned package works
   with Trace's React/Node/Vite/CSP environment; one live screen passes Interact/Pan/Edit,
   HMR, export, and touch tests.
2. **Migration gate** — new Designs use tldraw; the legacy fixture corpus upgrades without
   user-source diffs; modified scaffolds refuse safely; old saved previews still load; the
   tldraw runtime meets or exceeds the agreed current-canvas baseline.
3. **Selection and agent gate** — frame/element/region selection, context chips, message
   events, variants, deterministic Edit, layout persistence, and selected-screen Build pass
   two-client tests.
4. **Critical parity gate** — persistent drawing tools, Focus, Export PNG, recovery, security
   boundaries, performance budgets, and the complete P0 parity journey pass in a hosted
   environment. This is the Canvas v2 launch gate.
5. **Follow-on parity gate** — suggestions, Templates/References/Library, and design-system
   apply/extract complete the P1 scope independently of the Canvas v2 launch.

## Acceptance Criteria

### Canvas v2 / P0

Canvas v2 is launchable when all of the following are demonstrated:

1. A new Design renders through the pinned, licensed tldraw SDK inside the current isolated
   runtime with source, HMR, saved-preview, and error-boundary behavior intact.
2. An unmodified legacy Design upgrades through one verified managed commit and renders the
   same user screens without changing user-owned source, manifest, brief, tokens, or assets.
3. A legacy Design with modified Trace scaffold files refuses automatic migration, names the
   conflicts, and leaves its branch and working tree unchanged.
4. Previously saved custom-canvas HTML previews remain viewable after the live workspace is
   upgraded.
5. The user can switch among Interact, Pan, Chat, Draw, Edit, and Generate without creating
   another runtime or iframe.
6. Selecting a frame creates a context chip and exposes Export, Build, Focus, and More.
7. Selecting a marked DOM element creates an element chip with a valid source path/id.
8. Dragging a region produces normalized region context tied to exactly one screen.
9. Sending a contextual prompt creates a `message_sent` event whose payload lets a second
   client render the same chips and whose delivered agent prompt names the exact source.
10. The agent can update one selected frame without removing unaffected sibling frames.
11. Generate Variant creates a new manifest-indexed frame with parent/lineage metadata and
    leaves the source frame intact.
12. A brush, text, rectangle, arrow, and sticky annotation can be created, refreshed, viewed
    by another client, edited, deleted, and attached to a prompt.
13. Moving one or more screen shapes updates `design.canvas.json` through one service-owned
    commit/event, and a stale or failed update returns the shape to its authoritative
    position.
14. Edit mode uses the shipped deterministic manual editor, previews changes, saves one
    managed commit/event batch, and preserves drafts on conflict.
15. Build copies the selected frame subset at a resolved commit into a chosen target
    workspace before the target agent begins and links the source/target sessions.
16. Export PNG produces valid bytes matching the selected frame viewport; completion is not
    emitted before storage succeeds.
17. Whole-canvas offline HTML export and saved Design preview still work, including durable
    annotation review while the live runtime is paused.
18. Generated content never gains Trace-origin cookies or a general service RPC channel.
19. Runtime inspection shows no tldraw sync/hosted-storage connection and no raw tldraw
    store snapshot entering GraphQL, Trace events, or Zustand.
20. The checked-in reference fixture meets the performance and reliability budgets.
21. Focused service, schema, store, component, starter, migration, export, and browser tests
    pass.
22. Existing App, PDF, Animation, Coding, Design, and design-system creation smoke paths do
    not regress.

### P1 follow-on parity

P1 is complete when contextual suggestions use normal chat, the
Templates/References/Library drawer is searchable and permission-aware, apply-system
preserves the original through a fork/variant, and extract-system opens the existing
validated workbench without silently applying or publishing output.

## Required Verification

- Dependency spike for selected tldraw, React/React DOM, Node, Vite, and CSP compatibility.
- Runtime-upgrade tests for fingerprint detection, file ownership, modified-scaffold refusal,
  expected-commit conflicts, failed verification cleanup, commit/event ordering, rollback,
  and legacy saved-preview access.
- Custom ShapeUtil tests for screen geometry, deterministic ids, pointer gating, error
  boundaries, and manifest-to-store reconciliation without annotation loss.
- Browser parity tests for wheel, trackpad, pinch, fit, focus, undo/redo, HMR, and interactive
  screen content in the tldraw runtime.
- Manifest tests for v1 compatibility, v2 lineage validation, missing parents, and cycles.
- Layout service tests for authorization, stale commits, batch movement, bounds, commit/event
  ordering, and failed-intent rollback.
- Bridge tests for origin, source window, protocol version, payload validation, and caps.
- Service/store tests for annotation create/update/delete and optimistic reconciliation.
- Session service tests for structured design context and stale/unauthorized inputs.
- Browser test for frame, element, and region selection into composer chips.
- Browser test for deterministic Edit mode through save, event, HMR, and refresh.
- Browser test for annotation persistence across two clients.
- Integration test for selected-screen handoff and target delivery ordering.
- Export integration test for valid PNG signature/dimensions, network blocking, failure
  events, and storage completion ordering.
- Hosted smoke path covering targeted iteration, a derived variant, annotation feedback,
  Build handoff, PNG export, runtime pause, and saved-preview recovery.

## Risks and Mitigations

### Manifest and tldraw store drift

The manifest, durable annotation entities, and runtime store can disagree during HMR or an
optimistic update. Use deterministic shape ids and one-directional reconciliation: manifest
screens and Trace annotation events project into tldraw; tldraw sends bounded intents back
to services. Failed layout intents restore manifest state. Never persist an opaque snapshot.

### tldraw license or release behavior changes

The SDK is commercially licensed and may change license enforcement, network behavior,
package requirements, record schemas, or UI contracts. Pin an exact release, complete the
commercial agreement before production, review disclosed telemetry/CSP requirements, and
upgrade only through the dependency parity suite. Keep vendor types inside the Design
runtime integration boundary.

### Interactive DOM conflicts with canvas gestures

The custom screen shape contains a live React page whose controls need pointer events, while
tldraw uses the same input for selection and camera tools. Make Interact a distinct tool
state with explicit event gating, disable screen rotation and first-release resizing, and
cover nested buttons, inputs, scroll areas, drag controls, touch, and keyboard focus in
browser tests.

### Copied starters create runtime version skew

Existing Design repositories contain committed scaffold code, so a central starter change
does not reach them automatically. Require the runtime marker and service-owned upgrade.
Fingerprint Trace-owned files, preserve user-owned paths, stop on modifications, verify
before commit, and retain old commit-addressed previews. Never make a best-effort overwrite.

### Agent overwrites user annotations or manual edits

Annotations are separate Trace entities, so source generation cannot erase them. Manual
edits are committed source and use hashes; the agent must read the current tree before
changing it.

### Selection becomes stale during HMR

Selections carry stable screen/element ids and are revalidated after manifest/runtime
updates. Stale items remain visible as invalid chips until removed or reselected; they
never silently retarget.

### Canvas protocol becomes a general iframe escape hatch

Keep a small versioned allowlist. The iframe reports intent and geometry; the shell decides
whether to call a service. Never expose tokens or generic GraphQL calls.

### The library becomes a second asset platform

V1 is a read/filter/select surface over templates, existing attachments, design systems,
and generated projects. It does not introduce a generalized asset marketplace.

### Scope expands into Figma parity

The completion gate focuses on selection, feedback, iteration, and handoff. Layout engine,
vector editing, component authoring, and design-token management remain source/agent or
design-system concerns.

## Resolved Product Decisions

- Adopt the published tldraw SDK as the Design canvas engine.
- Put tldraw inside the existing isolated Design runtime, not the privileged Trace shell.
- Use a custom `TraceScreenShapeUtil` for manifest-indexed live React screens and supported
  built-in tldraw shapes for annotations.
- Keep `design.canvas.json`, managed Git, Trace services, and the event log authoritative;
  do not adopt tldraw sync or raw store snapshots as shared product state.
- Acquire a commercial production license and pin an exact reviewed SDK release.
- Version Design runtimes and migrate eligible existing Design repositories through a
  verified service-owned commit; do not limit tldraw to newly created Designs.
- Keep one Design runtime and iframe; do not create per-frame runtimes.
- Keep screens/sections manifest-backed; do not add screen database entities in v1.
- Add database entities only for persistent annotations and exports.
- Reuse normal Trace chat for all agent work; suggestions and Generate feed that chat.
- Reuse the shipped manual editor for Edit mode.
- Extend `attachDesignToSession` for selected frames instead of creating a new handoff
  platform.
- Keep whole-canvas HTML export and add selected-frame PNG.
- Preserve immutable design-system versions by applying through fork/variant semantics.
- Defer third-party inspiration and standalone media artifact types.

## Open Questions Before Phase 3

- Should organization-owned templates be ordinary managed repositories, immutable storage
  packages, or a constrained extension of `DesignSystemVersion`?
- Which existing generated project kinds should appear in Library before live App frames
  are supported on the canvas?
- Should extracting a design system from a Design use the whole Design commit by default
  or require an explicit selected-frame subset?
- What license/provider terms would be acceptable for a future inspiration catalog?

## Decision Log — 2026-08-02 Review

This PRD was reviewed against the shipped codebase, and the tldraw decision was
pressure-tested against two alternatives: building the interaction layer in-house on the
existing canvas runtime, and a React Flow (xyflow) hybrid with a Trace-owned annotation
layer. Outcome: **adopt tldraw as written.** tldraw is the only engine that natively
combines custom live-DOM shapes, drawing tools, a full selection model, and undo, and it
is the proven engine behind the Replit Design Canvas this PRD targets. Where this log
conflicts with earlier sections, this log controls.

### Licensing posture

Planning proceeds on the assumption the commercial agreement lands; the agreement remains
a release gate, not an engineering follow-up. The license conversation must explicitly
cover two Trace-specific uses beyond standard production keys:

- embedding tldraw in redistributable offline `design.html` exports and commit-addressed
  saved previews (the license restricts standalone redistribution);
- production key behavior for the dev-mode Vite runtime served through the user-content
  endpoint proxy, versus the production builds used for saved previews and exports.

### Resolved implementation decisions

1. **Canvas-attached chrome renders inside the preview runtime.** The mode toolbar, frame
   action bar, selection chrome, and draw tools use tldraw UI overrides in the starter,
   where they can track the camera. The Trace shell keeps the composer, context chips,
   drawer, and dialogs. Camera geometry is never streamed to the shell.
2. **The Canvas v2 bridge is starter code, not proxy-injected.** It needs direct tldraw
   editor integration. Shell-side schema/version/origin validation carries all trust; the
   existing injected manual-edit overlay is retained for Edit-mode element picking.
3. **Screen positions become explicit; auto-flow becomes a one-time fallback.** Manifest
   v2 requires positions on new screens. Legacy screens get the existing fallback
   placement at load, persisted lazily on first move — never auto-committed on open.
4. **Layout persistence rebases instead of hard-rejecting.** `DesignCanvasLayoutService`
   applies position patches keyed by screen id onto the current branch head and rejects
   only when the screen no longer exists. This supersedes the strict
   `expectedCommitSha` reject-on-stale contract so dragging works while the agent is
   committing. Layout-only commits are marked and skip the saved-preview rebuild
   pipeline.
5. **PNG export renders the commit's saved self-contained HTML server-side** in the
   existing bounded browser pool, through a new single-frame render mode
   (`?__trace_screen=<id>`), building the saved preview first when the commit lacks one.
   Export never depends on the live dev server, so it works while the runtime is paused.
6. **Rollout uses an env toggle plus the runtime marker, not a flag service.**
   `TRACE_DESIGN_RUNTIME_V2` gates new-workspace seeding; legacy upgrade is a per-Design
   user-initiated action. No per-org feature-flag infrastructure in v1.
7. **Undo never crosses a persistence boundary in v1.** tldraw history applies to
   uncommitted local drafts only; undoing a persisted move or annotation is an explicit
   new service action.
8. **`data-trace-id` stamping has owners.** The starter primitives and the design agent
   instruction overlay stamp ids; the shipped manual-editor element mechanism and region
   selection cover unmarked DOM.

### Revised delivery order

Scope is unchanged; ordering replaces the Phase 0–2 sequencing. Legacy migration moves to
the end so the fleet migrates once, onto a proven runtime, and the core loop ships on new
Designs first. Release gates 1–5 still apply, mapped onto slice boundaries.

- **Slice 0 — feasibility spike (~1 wk).** One live manifest screen in
  `TraceScreenShapeUtil`; prove Interact pointer gating, HMR without editor remount,
  trackpad/touch parity, export build with tldraw inlined, and the 24-screen performance
  fixture. Go/no-go on feel.
- **Slice 1 — engine swap for new Designs only (~2 wks).** Replace canvas internals; keep
  manifest parsing, screen resolution, error boundaries, and export. Existing Designs
  keep their committed runtime untouched. No migration service yet.
- **Slice 2 — selection → chat context (~2–3 wks).** Versioned bridge,
  frame/element/region selection, composer chips, `DesignPromptContextInput` on
  `sendSessionMessage`, normalized context in `message_sent` and the agent prompt.
- **Slice 3 — movable frames and variants (~2 wks).** Layout intents and service,
  manifest v2 lineage, Generate menu routed through the composer.
- **Slice 4 — Draw mode and annotations (~2–3 wks).** `DesignAnnotation`
  entity/service/events, allowlisted shape codec, optimistic reconcile, caps, annotation
  chips.
- **Slice 5 — frame actions (~2–3 wks).** Focus, Export PNG with `DesignFrameExport`,
  Build handoff via `attachDesignToSession` extended with screen ids and commit SHA.
- **Slice 6 — legacy migration (~2 wks).** `DesignRuntimeUpgradeService`, fingerprints,
  modified-scaffold refusal, upgrade CTA with explicit install/verify latency messaging,
  fixture corpus.
- **Slice 7 — P1 scope.** Suggestions, Templates/References/Library drawer,
  design-system apply/extract.

### Resolved verification items

- React compatibility is already satisfied: the design starter's lockfile resolves React
  and React DOM 19.2.7, within tldraw 5.2.5's peer range (`^18.2.0 || ^19.2.1`). Raise
  the declared `^19.0.0` floor to `^19.2.1` when the dependency lands.
- tldraw 5.2.5 verified on npm: 13.7 MB unpacked, 1,853 files, dependencies include the
  tiptap rich-text stack and radix-ui. Budget workspace install time and export bundle
  size in the Slice 0 spike.
