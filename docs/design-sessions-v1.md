# Design Sessions v1

Status: product and implementation specification (2026-07-14).

This document defines the first shippable version of Trace Design. It intentionally
narrows the broader vision in `docs/design-app-sessions-master-plan.md`. Where the two
documents conflict for v1, this document controls.

## Goal

Let a user describe a product interface in chat and watch an agent build and continuously
update a multi-screen React design on one live canvas.

Design v1 should reuse the existing App session path wherever possible. It is not a new
artifact platform, a Figma replacement, or a collection of independent preview runtimes.
It is one specialized React app whose output is a canvas containing many logical screens.

## Product Definition

Design answers: **“What should this look like across variations, states, and viewports?”**

A design session has:

- the existing Trace chat on the left
- one live React preview on the right
- one AI-controlled canvas inside that preview
- any number of logical screens on the canvas
- one hidden managed repo and one provisioned workspace
- live updates through the same dev-server and preview flow as App sessions

The agent is the canvas operator. The user directs the work through normal chat, answers
questions in the existing chat UI, and chooses which directions to keep developing.

## V1 Decisions

- **Reuse the App session runtime.** A design session provisions the existing cloud
  workspace, managed repo, process, endpoint, and preview infrastructure.
- **Use React.** The design starter is a Vite + React + TypeScript + Tailwind project.
- **Render one canvas in one preview.** All screens share one React tree, dev server,
  endpoint, and sandboxed iframe.
- **Keep screens logically independent.** Every screen has a stable id, metadata, and a
  separate React component even though screens do not have separate browser runtimes.
- **Let the AI control the screen set.** The agent may add, remove, rename, regroup,
  reorder, and edit screens by changing source files and `design.canvas.json`.
- **Use the existing chat question flow.** V1 adds no canvas-specific question entity or
  question UI.
- **Use hot reload for visible progress.** The preview updates as the agent edits files;
  Trace does not wait for the entire requested batch to finish.
- **Export the whole canvas as interactive HTML.** The exported file includes the same
  canvas runtime and retains pan, zoom, fit, focus, labels, and screen interactions.
- **Do not add design comments in v1.** There are no pins, anchored comments, or
  “send to agent” comment actions.
- **Do not add per-screen artifact entities in v1.** Git is the durable source of truth,
  and `design.canvas.json` is the authoritative screen index.

## User Experience

### Creating a Design

The user chooses **New design** and enters an initial prompt, for example:

> Design four dashboard variations. Show default, loading, and error states for each.

Trace creates a `design` session group without asking for a repository, stack, runtime,
or hosting choice. It provisions the design starter through the same path used by an App
session and opens the session immediately.

The initial layout is:

```text
+----------------------+--------------------------------------------+
| Chat                 | Live design canvas                         |
|                      |                                            |
| User prompt          | Variation A  [default] [loading] [error]   |
| Agent progress       | Variation B  [default] [loading] [error]   |
| Questions            | Variation C  [default] [loading] [error]   |
| Follow-up prompts    | Variation D  [default] [loading] [error]   |
+----------------------+--------------------------------------------+
```

The global sidebar may collapse when the design opens, but it remains user-controllable.
Repo selection and app-specific database/runtime controls are not part of the primary
design UI. Logs may remain available as a diagnostic surface rather than a main tab.

### AI Control of the Canvas

The agent controls both screen contents and canvas composition. It can:

- create several variations from one brief
- create multiple states or viewports for every variation
- add and remove screens
- rename and reorder screens
- group screens into sections
- update one screen without rewriting the others
- apply a requested change across a selected logical group
- reorganize the canvas as the design develops

For the example prompt, the agent creates twelve logical screens:

```text
4 variations x 3 states = 12 screens
```

A follow-up such as “add an empty state to every variation” adds four components and
updates the manifest, producing sixteen screens. A follow-up such as “keep B and D, remove
the others, and add mobile versions” changes the screen set and canvas organization in
place.

V1 does not require direct manipulation tools for users. The user controls the result
through chat; pan, zoom, fit, and focus controls are provided by the design canvas runtime.

### Questions

Questions use the existing agent question flow in chat. For example:

> Which direction should I develop further?
>
> 1. Variation A — minimal
> 2. Variation B — information dense
> 3. Variation C — guided
> 4. Continue all three

While the agent is waiting:

- the session uses the existing `needs_input` behavior
- the canvas remains visible and interactive
- completed work remains available
- answering in chat resumes the same agent session

V1 does not highlight question targets on the canvas or create an “Action needed” canvas
entity. The agent should refer to stable, visible screen names in its question.

### Live Updates

The canvas should look active because real file changes appear continuously:

- the starter preview becomes available as soon as its dev server is ready
- sections and screens appear as the agent adds them
- edits flow through Vite hot module replacement
- changing one screen component updates that artboard without navigating the parent Trace
  page or creating a new preview
- adding or removing manifest entries updates the canvas organization
- session output in chat describes current work and failures

Trace must not simulate progress. Visible changes correspond to actual source edits,
manifest edits, build state, or runtime state.

Generated source may be temporarily invalid during an edit. Vite's error overlay can
report compile failures while preserving the last rendered page where possible. Each
artboard must also have a React error boundary so a runtime error in one screen does not
remove successful sibling screens. The preview recovers automatically after the agent
fixes the source.

### Refresh and Recovery

Reloading Trace should reopen the same design session and preview. The current workspace
continues running when available. If the provisioned workspace is recreated, it restores
from the managed repo using the existing session provisioning and checkpoint paths.

The user should never need to understand or select the hidden repo.

### Interactive HTML Export

V1 exports the complete design canvas as one self-contained `design.html` file. The
export contains the design source compiled for the browser plus the stable canvas runtime.
It does not contain Trace's chat, session controls, authentication, or development tools.

Opening `design.html` must provide:

- all sections and screens from the exported manifest snapshot
- pan, wheel/trackpad navigation, zoom controls, fit-to-canvas, and focus mode
- screen labels, state labels, and viewport frames
- interactions implemented inside screen components
- per-artboard runtime error boundaries
- operation from `file://` with no network connection

The first export mode is whole-canvas only. A later screen export may omit the canvas
runtime and render one selected screen at its native viewport.

The export must be deterministic for a committed source snapshot. It must not proxy the
live preview URL, depend on the running workspace, or fetch JavaScript, CSS, fonts, or
images from Trace. Required assets are bundled or encoded into the HTML. External assets
introduced by the agent must either be embedded during export or fail validation with a
clear message; silently producing an export that only works online is not acceptable.

For v0, the design starter may own a same-origin download endpoint such as
`/__trace_design_export`. On request it:

1. validates `design.canvas.json` and referenced component files
2. runs a production Vite build configured to inline JavaScript and CSS
3. verifies that the output is one HTML file with no local asset references
4. returns it as `attachment; filename="design.html"`

An **Export HTML** control in the canvas toolbar downloads from that endpoint. This keeps
the first implementation inside the existing provisioned design runtime. A later version
may move export to a server-owned worker so it works while the runtime is offline.

## Runtime and Repository Model

Design v1 uses the same basic execution model as App sessions:

```text
Design session
    -> provisioned workspace
    -> hidden managed Git repo
    -> Vite/React design starter
    -> managed dev-server process
    -> one private preview endpoint
    -> one iframe in Trace
    -> optional self-contained design.html download
```

Differences from an App session:

- the starter is a design canvas rather than a full-stack application
- the system prompt tells the agent to produce visual screens, not a standalone product
- the primary output is the canvas and its screen source
- database, Redis, API routes, and backend behavior are not part of the default brief
- the main UI emphasizes chat and preview rather than terminal, logs, and processes

Do not create a second design-specific provisioning system. Extend the existing services
to accept both `app` and `design` where they manage the shared runtime mechanics. Keep
kind-specific validation, starter selection, agent instructions, and UI composition at
explicit seams.

## Design Starter

The starter should contain a stable canvas runtime and an agent-owned design directory:

```text
src/
  App.tsx                         # stable canvas entry point
  design/
    screens/                     # one component per logical screen
      variation-a-default.tsx
      variation-a-loading.tsx
      variation-a-error.tsx
    styles.css                   # design tokens and shared design styles
design.canvas.json               # authoritative canvas and screen metadata
```

The stable runtime owns:

- pan, zoom, fit, and focus behavior
- section and artboard layout
- loading and empty states
- per-artboard error boundaries
- resolving manifest component paths through a fixed `import.meta.glob` contract
- displaying screen labels and viewport frames
- the whole-canvas Export HTML control

The agent owns:

- files under `src/design/screens/`
- shared design styles and tokens
- section and screen entries in `design.canvas.json`

The agent should not replace the canvas runtime unless the user explicitly asks to change
the design tool itself.

## Canvas Manifest

`design.canvas.json` is the authoritative logical screen index. The UI must not infer the
screen set by parsing JSX.

V1 needs this minimum shape:

```json
{
  "version": 1,
  "sections": [
    {
      "id": "variation-a",
      "name": "Variation A",
      "screenIds": ["variation-a-default", "variation-a-loading"]
    }
  ],
  "screens": [
    {
      "id": "variation-a-default",
      "name": "Default",
      "variation": "variation-a",
      "state": "default",
      "viewport": { "width": 1440, "height": 1000 },
      "component": "./screens/variation-a-default.tsx"
    }
  ]
}
```

Requirements:

- ids are stable across edits and unique within the design session
- section `screenIds` must resolve to screen records
- component paths must stay inside the agent-owned screen directory
- every screen component must exist
- removed screens are removed from section membership and the screen index
- ordering in the manifest controls ordering on the canvas
- variation, state, and viewport are structured fields rather than naming conventions
- unknown manifest versions fail visibly instead of being guessed

The starter validates the manifest at runtime and renders a clear diagnostic on invalid
entries. Server-side validation can be added when Trace needs to index screens outside the
running preview; it is not required to create separate screen entities in v1.

## Agent Instructions

Design sessions receive a design-specific instruction overlay. It must tell the agent to:

- build visual product designs, not a full-stack app
- use the provided React design starter and preserve its canvas runtime
- create one component per logical screen
- use stable, descriptive screen ids
- keep `design.canvas.json` consistent with component files
- represent variation, state, and viewport explicitly
- use semantic Tailwind and shadcn-compatible patterns where appropriate
- include meaningful default, loading, empty, error, and success states when relevant
- make narrow edits for follow-up requests
- let the existing dev server hot-reload changes; never start a second server
- ask blocking product questions through the existing chat question mechanism
- commit and push meaningful checkpoints to the managed repo
- keep exported designs self-contained by using local or embeddable assets

The agent may decide how many screens are needed unless the user specifies an exact count.
It should explain important assumptions in chat and ask only when a decision materially
changes the result.

## Service and UI Reuse

### Reuse Without Forking

The implementation should reuse:

- `startSession` and `SessionGroup.kind`
- cloud environment provisioning
- managed repo creation and authentication
- bridge workspace setup
- pending initial prompt delivery
- coding-tool execution and streaming
- session questions and `needs_input`
- process supervision and port detection
- private endpoint creation and preview authorization
- App preview loading and error states
- checkpoint, restore, and workspace recovery paths
- private endpoint authorization for the same-origin export download

### Design-Specific Behavior

The implementation adds:

- a **New design** entry point and Designs sidebar section
- design-kind validation: initial prompt required, no user repo, cloud hosting
- design starter selection
- the design-specific agent instruction overlay
- a design session layout using existing chat plus one existing preview component
- the canvas runtime and manifest contract inside the starter
- the design starter's self-contained HTML build and download path

Shared runtime services must not duplicate their business logic for Design. If an existing
service currently rejects every non-`app` group, broaden the shared mechanical operation
to `app | design` and keep truly app-specific behavior guarded separately.

## Events and State

V1 does not need events for every screen or artboard. Existing session, message, process,
endpoint, and checkpoint events remain the source of truth for Trace state. Vite HMR is
the transport for changes inside the live design preview.

Mutations remain fire-and-forget for shared state. Resolvers remain thin and all session
creation, provisioning, and checkpoint behavior remains in services.

Later versions may ingest the manifest into event-backed screen entities when Trace needs
cross-session search, screen-level publishing, comments, or screen-level collaboration.

## Security

The generated design is untrusted user content and must use the same preview isolation and
authorization boundaries as App sessions. It must not render directly in the Trace app
origin or receive Trace cookies.

The one-preview decision reduces runtime duplication; it does not weaken the iframe and
endpoint security boundary.

## V1 Non-Goals

- card-level or element-level comments
- pins and anchored agent requests
- separate iframes or endpoints for individual screens
- database-backed `Artifact`, `CanvasSection`, or `DesignComment` entities
- direct manipulation of individual screen elements in Trace
- a no-model token editor
- per-screen public publishing
- PDF, selected-screen HTML, or ZIP export
- automatic promotion into a coding session
- serverless in-browser Babel packaging
- an Open Design daemon or separate design generation service

These can be added after the core chat-to-live-canvas loop proves useful. The manifest and
stable screen ids preserve a migration path without requiring those systems now.

## V0 Implementation Slice

V0 is the smallest hosted end-to-end version that proves the product loop. It is a subset
of v1, not a disposable mock.

V0 includes:

- New Design prompt-first creation
- `design` session validation and design-specific agent instructions
- the existing App provisioned runtime, managed workspace, process, endpoint, and preview
  path generalized to support `design`
- a separate bundled design starter selected by session kind
- one manifest-driven React canvas in one iframe
- AI creation and editing of multiple screen components
- pan, zoom, fit, focus, sections, labels, and artboard error boundaries
- live Vite HMR while the agent works
- existing chat questions and `needs_input` behavior
- whole-canvas, self-contained interactive HTML export
- focused tests plus one hosted smoke path

V0 does not include comments, pins, artifact database entities, per-screen previews,
screen selection from the Trace shell, public design publishing, PDF/ZIP export, or coding
promotion.

### Concrete Implementation Map

The following files are the expected starting points. Implementers should follow the
current code rather than assuming names are exhaustive.

Server:

- `apps/server/src/services/session.ts`
  - validate new design sessions like App sessions: initial prompt required, no user repo,
    and cloud hosting
  - add a design instruction overlay everywhere the App instruction overlay is currently
    added to agent runs and resumed runs
  - preserve existing App and Coding behavior
- `apps/server/src/services/session-applications.ts`
  - treat `design` as a generated-project runtime when choosing the default application
    config and resolving a repo-less cloud runtime
  - reuse process, port, endpoint, preview-token, and lifecycle behavior
  - do not expose app-only publish behavior as design publishing
- `apps/server/src/services/session-application-workflow.ts`
  - allow the same default dev-server workflow for Design
  - keep app-specific checkpoint capture or publishing behavior explicitly guarded

Bridge and runtime image:

- add `apps/container-bridge/design-starter/` beside `app-starter/`
- generalize `apps/container-bridge/src/app-workspace.ts` or its caller to select the
  bundled starter from `SessionGroup.kind`; do not copy the provisioning implementation
- ensure container/runtime image definitions include the design starter
- retain exactly one workspace and dev-server process per design session group

Web:

- extend `apps/web/src/lib/create-quick-session.ts` with design creation using
  `kind: "design"`, `hosting: "cloud"`, and the initial prompt
- add a shadcn-based New Design dialog following `NewAppSessionDialog.tsx`
- add a Designs sidebar entry following `AppsSection.tsx`
- update `SessionGroupDetailView.tsx` so Design uses the existing chat-plus-canvas
  workspace and preview readiness path
- reuse or narrowly generalize `AppSessionWorkspace`, `AppSessionPreviewPanel`, and their
  readiness helpers; do not duplicate the preview stack

Design starter:

- use the same supported Vite/React/TypeScript/Tailwind baseline as the App starter
- keep canvas runtime files separate from `src/design/`, which the agent edits
- add a valid example manifest and at least one example screen
- load screen modules through a constrained `import.meta.glob`
- validate the manifest before rendering
- implement per-artboard error boundaries
- implement the same-origin self-contained HTML export endpoint and canvas toolbar button
- add design-specific `docs/ai-guidance.md` explaining the file and manifest contract

Tests and smoke:

- add focused server tests for design validation, instruction injection, workflow reuse,
  and protection of App/Coding behavior
- add bridge tests proving kind-based starter selection and restore behavior
- add starter tests or a build check covering valid/invalid manifests and the single-file
  export
- add web tests for design creation and design workspace selection
- add `scripts/smoke-cloud-design-session.mjs` and a root
  `smoke:cloud-design-session` command modeled on the existing App smoke script

No GraphQL enum or Prisma model should be duplicated: `SessionGroupKind.design` already
exists. Add schema operations only if the v0 UI cannot use an existing operation.

### V0 Completion Gate

Do not call v0 complete until a hosted smoke run proves this sequence:

1. Create a design session from a prompt without a repo or runtime picker.
2. Verify the group kind is `design`, one hidden managed repo exists, and exactly one
   workspace/process/endpoint is active.
3. Open the private preview and see the design canvas.
4. Ask the agent for four variations with default, loading, and error states.
5. Observe twelve uniquely identified screens on the same live canvas.
6. Ask for an empty state across every variation and observe four screens appear through
   HMR without creating another endpoint or reloading the parent Trace page.
7. Trigger the existing chat question flow, answer it, and verify work resumes.
8. Download `design.html`, disconnect from the network, open it from `file://`, and verify
   pan, zoom, fit, focus, labels, and screen interactions.
9. Verify focused tests pass and a normal App session still starts and previews correctly.

## Copy-Paste Codex Goal

```text
Implement Design Sessions v0 end to end according to docs/design-sessions-v1.md.

Reuse the existing App session infrastructure instead of creating a parallel platform.
A new design session must be prompt-first, repo-less, cloud-hosted, and provision exactly
one hidden managed repo, managed workspace, Vite process, private endpoint, and preview
iframe. Add a separate React/TypeScript/Tailwind design starter containing a stable
pan/zoom canvas runtime, design.canvas.json, and one component per logical screen. The
agent must control screen creation, deletion, grouping, variation, state, viewport, and
content by editing the manifest and screen files. All screens render inside one React app
and update live through Vite HMR. Reuse the existing chat and question/needs_input
behavior. Do not implement comments, pins, artifact database models, or per-screen
iframes.

Add whole-canvas HTML export. The canvas toolbar must download one self-contained
design.html that opens offline from file:// and retains pan, zoom, fit, focus, labels, and
screen interactions without Trace authentication or network assets.

Follow Trace architecture rules: services own mutations and events, GraphQL resolvers
stay thin, shared state comes from events, and existing App/Coding behavior must not
regress. Generalize the current App provisioning, application workflow, preview, and
workspace code only at the necessary seams. Do not duplicate schema types that already
exist.

Implement focused server, bridge, starter, and web tests, plus a hosted design smoke script
modeled on scripts/smoke-cloud-app-session.mjs. Use the v0 completion gate in the spec as
the definition of done. Audit the current code before editing, make surgical changes, run
the relevant tests and builds, and continue until the complete hosted workflow is proven
or a concrete external blocker is documented.
```

## Acceptance Criteria

V1 is complete when all of the following are demonstrated:

- A user can create a design session from a prompt without selecting a repo or runtime.
- Trace provisions exactly one managed repo, workspace, process, endpoint, and preview for
  the design session.
- The design starter loads as one React canvas in one iframe.
- A prompt requesting four variations with three states produces twelve manifest-indexed
  screens with stable unique ids.
- The canvas visibly adds screens as the agent creates files and updates the manifest.
- Asking for an empty state across all four variations adds four screens without creating
  new preview endpoints or reloading the parent Trace page.
- Editing one screen updates the running canvas through HMR while sibling screens remain
  present.
- A runtime exception in one artboard is contained by that artboard's error boundary.
- An agent question appears and resolves through the existing chat question flow.
- Refreshing Trace returns to the same design session and live preview.
- A checkpoint can restore the design workspace and reproduce the canvas.
- Export HTML downloads one `design.html` file that opens offline and retains pan, zoom,
  fit, focus, labels, and screen interactions.
- The export contains no dependency on the private preview URL or Trace authentication.
- Existing App and Coding session behavior remains unchanged.

## Suggested Delivery Order

1. Add the design starter and verify its manifest-driven canvas locally.
2. Allow `design` groups through the shared App provisioning, process, and endpoint path.
3. Add design-specific validation and agent instructions.
4. Add New Design and the chat-plus-preview session layout.
5. Verify live creation, deletion, and updating of multiple screens through HMR.
6. Add the whole-canvas self-contained HTML export.
7. Add focused service, UI, runtime, and hosted smoke coverage for the acceptance criteria.
