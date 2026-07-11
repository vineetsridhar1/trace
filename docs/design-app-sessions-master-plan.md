# Design and App Sessions Master Plan

Status: consolidated product and implementation spec (2026-07-09).

This document consolidates the decisions, tradeoffs, implementation contracts, gap plans,
and verification requirements from the design/app session planning thread. It is intended
to be the single starting point for another AI agent implementing or finishing the full
feature.

> Note: the source docs listed below were consolidated into this document and then
> removed, so those paths no longer resolve. Likewise, `pnpm smoke:design-session` is
> not yet written — the shipped smoke script is `pnpm smoke:cloud-app-session`.

Source docs that this consolidates:

- `docs/design-session-experience.md`
- `docs/open-design-harness-integration.md`
- `docs/managed-git-hosting.md`
- `docs/design-session-gap-closure.md`
- `docs/app-session-gap-closure.md`
- `docs/open-design-harness-gap-closure.md`
- `docs/design-app-gap-closure-plan.md`
- `docs/design-app-verification-plan.md`
- `docs/design-app-session-implementation-audit.md`

## One-Sentence Goal

Implement Trace's `design` and `app` session kinds as separate products on shared
session infrastructure: `design` sessions are serverless project-design canvases that
generate React canvas artifacts (rendered as HTML via in-browser transpilation) to
review, export, publish, and promote into coding sessions, while
`app` sessions are standalone cloud-run full-stack app builders with live preview,
logs/terminal, managed git durability, checkpoints, restore, and publish/share. They may
optionally export or hand off to coding, but that is not the default product outcome.

## Product Split

Trace should support three distinct session kinds:

- **`coding`**: repo-bound implementation work against real product code. This is the
  existing AI coding session model.
- **`design`**: project-facing visual exploration and artifact work. The output is the
  artifact itself: screens, mockups, decks, visual directions, PDFs, and reviewable
  design intent. Design sessions primarily promote into coding sessions.
- **`app`**: standalone runnable software. The output is a live app the user can run,
  inspect, checkpoint, restore, publish, and share. Many app sessions may be playful,
  disposable, or shared as-is and never become coding sessions. App sessions do not start
  from the user's repo and should not be forced through the design artifact model.

The original "web design session" idea split into `design` and `app` because they have
different success criteria:

- Design answers: "What should this look like?"
- App answers: "Can you build me a working standalone app I can run and share?"
- Coding answers: "Can you change this existing codebase?"

## Key Decisions

- **Design sessions use a managed workspace too.** They should feel almost like coding
  sessions under the hood: a Trace-managed git remote, a materialized bridge working
  directory, files written there, commits/checkpoints pushed back, and cleanup when
  deleted. The difference is that design renders artifact files from the working
  directory (React canvas source transpiled in the browser, or plain HTML) instead of
  running a dev server.
- **Design sessions use a canvas.** The primary workspace is a pan/zoom surface where
  multiple AI-generated artifact options can exist side by side.
- **Design artifacts are React canvas source, packaged like the Claude Design export.**
  The primary generation target is a React canvas artifact using
  `DesignCanvas`/`DCSection`/`DCArtboard`-style primitives, with screens as separate
  component files and a `design.canvas.json` metadata sidecar — not hand-authored
  free-form static HTML. Inspection of the actual Claude Design export
  (`/Users/vineet/trace/design.html`) confirmed it ships React + babel-standalone inside
  the bundle and transpiles JSX **in the browser at load time**. Its "bundling" is asset
  packaging (base64 manifest + unpacker), not ahead-of-time compilation. Trace should do
  the same: no server-side build pipeline for design artifacts.
- **`design.canvas.json` is authoritative for canvas metadata.** The sidecar drives
  Trace's `CanvasSection`/`Artifact` indexing and canvas state; the JSX source is
  authoritative only for rendering. Trace validates that the two agree; it never scrapes
  canvas structure out of JSX by static parsing.
- **Design sessions promote to coding sessions by default.** A selected artifact becomes
  project intent/reference for implementation in project code.
- **App sessions use cloud runtimes.** A standalone app needs a filesystem, package
  manager, dev server, logs, terminal, endpoints, checkpoints, and managed durability.
- **App sessions should default toward a full-stack starter.** The preferred v1 target is
  Next.js + Tailwind + shadcn, with a starter template in the runtime image. Keep the
  starter swappable internally, but do not expose stack selection in v1.
- **Use Open Design as a prompt/content source, not as a daemon.** Vendor the prompt
  composer and content formats; do not run the Open Design daemon in production.
- **Use the existing Trace primitives.** Resolvers stay thin, service methods create
  events, Zustand consumes events, and agents use the same service layer as humans.
- **Generated HTML is untrusted.** Render design artifacts from a dedicated user-content
  domain, never from the Trace app origin.
- **Managed git is shared durability for generated projects.** App and design sessions
  both use one hidden Trace-managed git repo and one bridge working directory per
  session group. They do not need git worktree or branch fan-out because there is only one
  active generated project per session group. App sessions run a full-stack dev server
  from that directory; design sessions render generated HTML files from it.

## Rejected or Deferred Paths

- **Do not run the Open Design daemon in production.** It duplicates Trace's process
  supervision, event stream, persistence, and adapter layers. Keep the daemon-embed path
  only as a historical fast-demo option.
- **Do not rebuild the Open Design prompt stack from scratch.** Vendor the composer and
  content instead.
- **Do not ask users to choose HTML vs. React vs. Next.js in v1.** Make stack choices by
  session kind.
- **Do not make design sessions secretly promote to app sessions.** A design artifact can
  start a standalone app later, but the primary bridge is design to coding.
- **Do not use `srcDoc` as the production artifact renderer.** `srcDoc` is a local fallback
  only. Production preview uses a user-content bootstrap iframe and `postMessage`.
- **Do not treat PDF export as a placeholder event.** The product requires real uploaded
  PDF binaries.
- **Do not expose managed repos as normal repos.** They are durability plumbing unless the
  user explicitly graduates to GitHub/export.
- **Do not build a server-side compile/bundler pipeline for design artifacts.** Rendering
  and export ship the JSX source plus React and babel-standalone and transpile in the
  browser at load time, exactly as the Claude Design export does. An ahead-of-time build
  step would add bundler infrastructure, introduce a new failure class (generated code
  that fails a server-side build) that the chat loop would have to handle, and break the
  serverless property of design sessions. The accepted trade-offs are slower first paint
  and no type-checking of generated code.
- **Do not derive canvas structure by statically parsing JSX.** The model will
  occasionally emit conditionals, computed props, or wrapper components that break a
  static parse. The model must emit the `design.canvas.json` sidecar alongside the
  source; the service validates that sidecar and source agree, and treats a mismatch as a
  generation error to surface, not something to repair by scraping the JSX.
- **Do not copy Open Design's screen-file-first canvas UX.** Screens stay separate
  component files in source (good for handoff and small diffs), but the product presents
  one canvas with many sections/artboards, which is the better UX (the Claude Design
  model).
- **Do not copy Open Design's live-artifact template model for normal designs.** It
  forbids scripts/iframes and targets refreshable data views (dashboards/reports). It may
  inspire a later "live dashboard" feature, but it is not the design-session artifact
  model.

## Architecture Principles

All implementation must follow Trace's existing architecture rules:

- Service layer owns business logic.
- Clients and agents call service methods; they do not create events directly.
- GraphQL resolvers parse input and call services.
- Every mutating service method appends events and broadcasts them.
- Frontend state is event-backed Zustand state; mutation results are not the source of
  truth for shared state.
- Session entities stay flat. Relationships are links, not containment.
- Vendor-specific code belongs in adapters or explicit integration seams.

## Shared Data Model

Required session-level concepts:

- `SessionGroup.kind`: `coding | design | app`.
- `SessionGroup.designSystemId`: selected design system for prompt composition.
- `SessionGroup.designSkillIds`: selected Open Design skills.
- `Artifact`: design artifact entity with:
  - `id`
  - `sessionGroupId`
  - `parentArtifactId`
  - `prompt`
  - `title`
  - `contentType`
  - `html` fallback for legacy/generated compatibility
  - optional `htmlStorageKey` or equivalent blob/cache reference for legacy rows or
    read-through serving
  - `repoId`, `repoFilePath`, and `repoCommitSha` for canonical managed-git artifact
    storage
  - `metadata`
  - `publishedAt`
  - `createdBy`
  - timestamps
- `DesignComment`: comment/pin entity or event payload tied to artifact/version anchors.
- `CanvasSection`: AI-authored section/group on the design canvas with title,
  description, order, position, and child artifact/frame ids. This can be a first-class
  table/entity or a structured field in design session metadata, but it must be
  event-backed and addressable.
- `Repo.provider`: `github | managed`.
- `GitCheckpoint`: existing checkpoint model, extended with capture metadata for app
  sessions when available.

## Design Sessions

### Product Contract

A complete design session supports:

- Prompt-first creation.
- No user-selected repo requirement.
- Managed design working directory materialized on the bridge/session runtime, similar to
  a coding session checkout but without branch/worktree fan-out.
- Hidden managed repo created at session start or before the first artifact write; the
  working directory remote points at the Trace managed git server.
- Multiple parallel artifact variants for a brief, generated as React canvas source and
  rendered as HTML in the user-content iframe.
- AI-authored canvas organization: section titles, explanatory descriptions, frame labels,
  and grouped artifact canvases, similar to Claude Design's "Current" /
  "Action needed" layout.
- Progressive rendering while generation streams.
- Artifact lineage: first variants are siblings, iterations are children.
- Canvas pan/zoom, selection, focus mode, and lineage expansion.
- Existing chat component as the left rail.
- No design tab bar.
- App sidebar auto-collapses when opening design mode.
- Card-level and element-level comments.
- `data-el` element anchors and comment pins.
- "Send to agent" comments that queue an anchored iteration.
- No-model token tweaks that patch CSS variables and create child artifact versions.
- User-content iframe preview and public publish URL.
- Real PDF export.
- Promotion into a linked coding session.

### Design Generation

Design sessions must use real model generation through `LLMAdapter`.

Generation target:

- The primary generation format is a **React canvas artifact**, not hand-authored
  free-form static HTML:
  - a thin `src/design-canvas.jsx` (or `.tsx`) containing only the
    `DesignCanvas`/`DCSection`/`DCArtboard` board structure
  - screen/artboard contents as separate component files under `src/components/*`
  - a `design.canvas.json` sidecar carrying the section/artboard metadata
- The prompt overlay must enforce the thin-canvas/separate-components split. A single
  canvas file holding every screen inline grows unboundedly, and every iteration would
  force the model to re-edit one giant file — keeping screens in small component files
  keeps iteration diffs small and context pressure manageable.
- Rendering loads React + babel-standalone in the user-content iframe and transpiles the
  JSX at load time, matching the verified behavior of the Claude Design export. There is
  no ahead-of-time compile step anywhere in the pipeline.
- The renderer must still support plain self-contained HTML artifacts for legacy rows and
  simple generations; React canvas source is the primary target, not the only accepted
  format.

Service contract:

- Add or finish a service method like
  `generateDesignArtifacts({ sessionGroupId, sessionId, prompt, baseArtifactIds?,
  elementAnchors?, directionCount?, designSystemId?, skillIds? })`.
- The service loads harness settings, composes the Open Design prompt with Trace overlay,
  calls the configured `LLMAdapter`, streams deltas as session events, persists finished
  artifact source plus the `design.canvas.json` sidecar (or plain HTML for simple
  generations), validates sidecar/source consistency, records usage, and appends
  completion/failure events.
- Fan-out is parallel. A first brief such as "give me three directions" creates sibling
  artifacts. Each direction stores direction metadata.
- Iteration includes parent artifact source (component files for React canvas artifacts,
  HTML otherwise), selected element anchors, comment context, token block, and comparison
  artifacts when selected.
- Failed variants produce visible failure events/cards without failing successful sibling
  variants.
- There must be no successful placeholder fallback when model credentials fail. Model
  failures emit `design_generation_failed`.

Expected events include:

- `design_generation_started`
- `design_artifact_delta`
- `design_artifact_created`
- `design_artifact_updated`
- `design_canvas_section_created`
- `design_canvas_section_updated`
- `design_generation_failed`
- `design_comment_added`
- `design_export_requested`
- `design_export_completed`
- `design_export_failed`
- `design_artifact_promoted`

Exact event names may follow existing schema conventions, but the event payloads must be
sufficient for Zustand to upsert entities without refetch.

### Design Workspace and Git Flow

Design sessions should be nearly identical to coding/app sessions for workspace
durability:

- Starting a design session creates or reserves a hidden Trace-managed repo.
- The bridge/session adapter materializes one working directory for the design group,
  similar to a coding session checkout but without extra git worktrees or branches.
- The working directory remote is set to the Trace managed git URL.
- The design generation service writes generated files into that working directory:
  - `src/design-canvas.jsx` — thin board structure (sections/artboards only)
  - `src/components/*` — screen/artboard implementations, one component per file
  - `design.canvas.json` — authoritative canvas metadata sidecar
  - `design-manifest.json` and `DESIGN-HANDOFF.md` — handoff/index outputs
  - `artifacts/<artifactId>/index.html` — plain-HTML artifacts for legacy/simple
    generations
  - optional token/assets files
- The service commits and pushes after successful generation, iteration, tweak, publish
  metadata updates, or layout changes.
- If the design session is deleted or archived past retention, the bridge working
  directory can be deleted. The managed repo follows the same retention/GC policy as
  other managed repos.
- There is no dev server requirement. Preview renders the HTML files through the
  user-content iframe/bootstrap path, not through port detection.
- There is no terminal/process/logs requirement for v1 unless a later "advanced design
  tool mode" needs it.

This preserves the operational shape users already understand from coding sessions:
there is a folder, it has files, it has a remote, and it can be recovered from Trace
managed git. The product difference is the UI and renderer, not the persistence model.

### Artifact Storage

Design artifacts are HTML files, so the durable source should be Trace-managed git rather
than only database/blob rows. This keeps design sessions lightweight while giving them the
same versioning, diffability, exportability, and future handoff properties as app
sessions.

Canonical storage target:

```txt
src/design-canvas.jsx                    # thin board: DesignCanvas/DCSection/DCArtboard only
src/components/*                         # screen/artboard implementations, one per file
design.canvas.json                       # authoritative canvas metadata sidecar
design-manifest.json                     # screen map, source files, tokens, viewport targets
DESIGN-HANDOFF.md                        # human-readable implementation handoff notes
tokens.css                               # optional extracted CSS variable block
artifacts/<artifactId>/index.html        # plain-HTML artifacts (legacy/simple generations)
artifacts/<artifactId>/metadata.json
artifacts/<artifactId>/assets/*          # later, if multi-file assets are supported
```

`design.canvas.json` supersedes the earlier `canvas/layout.json` / `canvas/source.*`
naming from prior revisions of this plan; there is one sidecar and it is the canvas
metadata source of truth. The downloadable self-contained bundle is derived output
generated on demand at export/publish time (asset embedding, not compilation) and does
not need to be committed.

Rules:

- The `Artifact` row remains the service/query index and stores lineage, prompt,
  publish state, metadata, and pointers into managed git.
- Add fields or metadata for `repoId`, `repoFilePath`, and `repoCommitSha` so every
  artifact version can be resolved to an immutable git blob.
- The design session creates or reserves a hidden managed repo and bridge working
  directory before the first artifact write.
- The service writes generated HTML/metadata into that design working directory through
  the bridge/session adapter or a server-owned workspace adapter for hosted runs, commits
  it, pushes/updates the managed bare repo, and then emits artifact completion events.
- A fan-out generation may commit all sibling artifacts in one commit or one commit per
  artifact. The event payload must still identify each artifact's file path and commit.
- An iteration creates a new commit; the parent artifact version stays addressable
  because its `repoCommitSha` pins the pre-iteration state. For React canvas artifacts,
  iterations edit the small component files rather than re-emitting the whole board. For
  plain-HTML artifacts, an iteration creates a new artifact directory/file.
- Canvas sections and placement metadata are committed with the artifacts so the managed
  repo can reconstruct the whole design board, not only individual HTML files.
- In the React canvas model, `Artifact` rows map to artboards: the row stores the
  artboard id from `design.canvas.json` plus `repoCommitSha`, so an artifact version
  resolves to a specific artboard within a specific commit of the canvas source.
- Canvas structure is ingested from `design.canvas.json`, never by parsing the JSX. The
  service validates that every section/artboard id in the sidecar exists in the source
  (a cheap string/id presence check is sufficient) and fails the generation attempt on
  mismatch.
- Blob/object storage may still be used as a read-through cache for large HTML or
  published serving, but managed git is the durable source of truth for generated design
  files.
- Keep legacy `Artifact.html` / `htmlStorageKey` fallback for existing rows and generated
  GraphQL compatibility if already present in the implementation.
- GraphQL and event payloads should hydrate artifact HTML from managed git or cache when
  the client needs the body.
- Generated artifact HTML is untrusted. Sanitize or constrain only as needed for storage
  and serving, while relying on origin isolation for runtime safety.

### User-Content Preview and Publish

Production design artifact rendering uses a wildcard user-content domain:

```txt
https://<artifactId>.<TRACE_USER_CONTENT_DOMAIN>/
```

Required behavior:

- Configure `TRACE_USER_CONTENT_DOMAIN` separately from the app domain.
- Authoring preview loads:

```txt
https://<artifactId>.<TRACE_USER_CONTENT_DOMAIN>/_bootstrap
```

- `_bootstrap` returns only a tiny shell. Direct navigation to `_bootstrap` must not leak
  artifact HTML.
- The parent Trace canvas pushes artifact content into the frame through `postMessage`.
  For plain-HTML artifacts the payload is the HTML itself. For React canvas artifacts the
  bootstrap shell loads React + babel-standalone, and the payload is the JSX source plus
  the target artboard id; the frame transpiles and renders at load time — no server-side
  compile.
- The frame replies with readiness, element-selection, pin status, and script-error
  messages.
- Message payloads must include a nonce and validate origins on both sides.
- Published artifact root URLs serve stored HTML directly only when `publishedAt` is set.
- Published serving should resolve artifact content from the artifact's managed-git
  `repoCommitSha` + `repoFilePath` or from a cache proven to match that commit. For React
  canvas artifacts, published serving delivers the packaged self-contained bundle derived
  from that pinned commit.
- Unpublished root URLs return 404 or equivalent.
- Authoring overlays are not injected into public published output unless an
  authenticated authoring path explicitly requests them.
- User-content responses set strict headers: CSP, Permissions-Policy, Referrer-Policy,
  COOP/COEP where compatible, content type, cache policy, and no Trace cookies.
- `srcDoc` preview is allowed only as a development fallback.

Suggested message protocol:

```ts
{ type: "trace:artifact:render", html, overlayEnabled, nonce }
{ type: "trace:artifact:ready", nonce }
{ type: "trace:artifact:element-selected", anchor, nonce }
{ type: "trace:artifact:error", message, stack, nonce }
{ type: "trace:artifact:pins-rendered", pinCount, nonce }
```

### Canvas UI

Design mode should preserve existing primitives while letting the AI author the canvas
structure itself:

- Use the existing session chat component, narrowed as a left rail.
- Hide the design/coding tab strip in design mode.
- Auto-collapse the global app sidebar in design mode.
- Hide irrelevant repo/application chrome for design groups.
- Render AI-authored sections on the right-side canvas. A section has a large title,
  explanatory description, optional frame/group labels, and one or more artifact cards
  underneath.
- Render artifact cards inside their section/group, not only as a flat list.
- The AI can create sections like "Current", "Exploration 1", "Action needed", "Final
  direction", or any task-specific grouping that helps explain the design work.
- The AI can add short descriptions that explain why each section exists and what changed
  in the artifacts below it.
- Support pan, wheel/trackpad scroll, zoom in/out, fit to canvas, and focus mode.
- Keep zoom responsive enough for natural canvas navigation.
- Cards render artifact iframes, status, title, created time, comments, export/publish
  actions, and generation failure state.
- Section titles/descriptions and card placement are event-backed state. Do not bake them
  into the HTML artifact itself as the only source of truth.
- Users should be able to select a section, a frame label, or an artifact card as prompt
  context.
- Element selection should use `data-el` anchors inside artifact HTML.
- Comments/pins belong to the artifact version they were created on.

### AI-Authored Canvas Sections

The model should be able to return both artifact source and canvas organization
metadata. This is the behavior shown in Claude Design: the AI creates narrative sections
with a heading, a short explanation, and grouped canvases underneath.

The downloaded Claude Design artifact in `/Users/vineet/trace/design.html` is a useful
reference shape. The source inside that bundle uses a small canvas DSL:

```jsx
<DesignCanvas>
  <DCSection id="current" title="Current" subtitle="Today's dashboard...">
    <DCArtboard id="cur" label="Today" width={1380} height={1640}>
      <BorrowerDashboard />
    </DCArtboard>
  </DCSection>
</DesignCanvas>
```

Trace does not need to copy these exact component names, but the product should support
the same concept:

- A board-level container.
- Section components/records with `id`, `title`, and `subtitle`/`description`.
- Artboard/frame components/records with `id`, `label`, `width`, `height`, and child
  artifact content.
- A generation contract where the model emits the same section/artboard structure into
  the `design.canvas.json` sidecar, which the service ingests into Trace's event-backed
  `CanvasSection` and `Artifact` entities. The sidecar — not JSX parsing — is how canvas
  structure reaches the data model.

Suggested section shape:

```ts
type DesignCanvasSection = {
  id: string;
  sessionGroupId: string;
  title: string;
  description?: string;
  order: number;
  x: number;
  y: number;
  width?: number;
  artifactIds: string[];
  groups?: Array<{
    id: string;
    title: string;
    description?: string;
    artifactIds: string[];
  }>;
};
```

Generation contract:

- Initial generation can create one or more sections, not just artifacts.
- A "current vs proposed" prompt should produce a "Current" section plus one or more
  proposal sections.
- A multi-option prompt should produce separate named sections or grouped frames for each
  direction when that communicates the design better than a flat row.
- Section title/description text is model-authored but editable/regenerable through the
  service layer.
- Section metadata is persisted in service state and committed to
  `design.canvas.json` in the design managed repo.
- Section updates emit events so other clients see the canvas reorganize in real time.
- PDF/export/publish can target a single artifact, a section, or the whole canvas later;
  v1 PDF may remain artifact-only if section export is not implemented yet, but the data
  model should not prevent section export.

### Downloaded Artifact Bundle

The Claude Design `design.html` export is the packaging reference. Direct inspection of
`/Users/vineet/trace/design.html` established these verified facts:

- It stores **every screen/artboard in the one file**. It does not reference Claude's
  servers per artboard; the only external URL present is the SVG namespace.
- It embeds a base64 asset manifest (16 assets in the sample: React, Babel, runtime
  scripts, JSX helper files, fonts) plus a JSON-escaped HTML template containing the
  actual design source.
- It ships `babel-standalone` and transpiles the `text/babel` JSX **in the browser at
  load time**. The bundle is asset packaging plus an unpacker — there is no ahead-of-time
  compilation anywhere.
- The unpacker swaps stable UUID placeholders for `blob:`/`data:` URLs at runtime, with
  special handling for fonts, and surfaces runtime errors visibly.

Trace should support a similar **download/export format**, separate from the canonical
managed-git source:

- Canonical source remains diffable managed-git files (`src/*`, `design.canvas.json`,
  `design-manifest.json`, `artifacts/*`).
- Downloaded output can be a single `design.html` bundle that runs offline from `file://`.
- The bundle may embed:
  - a thumbnail or placeholder preview
  - loading status such as "Unpacking..."
  - asset manifest with compressed/base64 JS, CSS, fonts, images, or generated files
  - template HTML with stable asset placeholders
  - unpacker script that creates blob URLs or data URLs, with special handling for fonts
  - runtime error sink visible to the user
  - no external network requirements
- For React canvas source, the exporter follows the Claude approach: embed the JSX source
  plus React and babel-standalone in the bundle and transpile in the browser at load
  time. Do not build a precompile path — same reasoning as preview: packaging, not
  compilation.
- Do not use the self-unpacking bundle as the internal authoring source of truth. It is
  optimized for portability, not reviewable diffs or service-layer state.
- User-content preview/publish can serve canonical artifact content directly; the
  download bundle is for explicit "Download HTML" or archival export.
- Borrowing Open Design's export handoff idea, a "Download ZIP" export should include:
  - the self-contained `design.html` bundle
  - the source files (`src/*`, `design.canvas.json`)
  - `design-manifest.json` — screen map, source files, tokens, interactions, responsive
    viewport checklist
  - `DESIGN-HANDOFF.md` — implementation notes for the receiving developer/agent

### Token Tweaks

- The design prompt must require a CSS variable block.
- The tweak service patches CSS variables deterministically without a model call.
- A tweak creates a child artifact version.
- Unpatched CSS variables must be preserved.
- The canvas should re-render the new artifact version from events.

### Comments and Agent Queueing

Anchor payloads:

```ts
{ type: "card", x, y }
{ type: "element", dataEl, rect?, label? }
```

Requirements:

- Render pins in artifact cards/focus mode.
- Store anchors with artifact/version context.
- If `sendToAgent` is true, queue a design generation request with the comment and anchor
  context.
- Iteration prompt context includes unresolved comments and selected anchors.

### PDF Export

Design PDF export is server-owned so export works even when the bridge folder has been
cleaned up or is not currently connected. The renderer reads from the managed repo/cache,
not from a live app process.

Requirements:

- Add/finish a service method like
  `exportDesignArtifact({ artifactId, format: "pdf", pageOptions? })`.
- Use a bounded Playwright/headless-Chromium pool or worker queue.
- Load artifact content from the artifact's managed-git commit/file pointer, or from a
  cache proven to match that pointer. For React canvas artifacts, package the source into
  the same self-contained bundle used for download (JSX + React + babel-standalone) and
  render that; headless Chromium executes the in-browser transpilation the same way the
  preview iframe does.
- Do not pass Trace cookies or credentials into the browser context.
- Apply the same network/CSP policy as preview.
- Honor print CSS, deck page structure, page size, margins, and background graphics.
- Upload the PDF through the existing upload/file pipeline.
- Emit completion only after a valid PDF exists.
- Completion payload includes artifact id, file/upload id or URL, byte size, and page
  count if available.
- Failure emits a distinct failure event.
- Tests should reject corrupt/non-PDF bytes.

### Publish and Promotion

Publish:

- `publishDesignArtifact` or equivalent sets publish state.
- Public URL opens from user-content root.
- Public URL should work in a clean browser session.

Promotion:

- Selected artifact(s) promote to a linked coding session.
- The coding session receives a concise brief, artifact references, and source design
  group metadata. For React canvas artifacts, promotion passes the **source** — the
  relevant `src/components/*` files, the `design.canvas.json` entry, and
  `design-manifest.json`/`DESIGN-HANDOFF.md` — which is far better implementation input
  than one flat HTML blob. Plain-HTML artifacts pass selected HTML or a summary.
- The coding UI should show promoted artifact reference context.
- Promotion emits a design promotion event.

## App Sessions

### Product Contract

A complete app session supports:

- Prompt-first creation with `kind: app`.
- No user-selected repo at creation.
- Cloud runtime provisioning only.
- Full-stack starter, preferably Next.js + Tailwind + shadcn.
- Open Design app prompt overlay through `RunOptions.appendSystemPrompt`.
- Agent starts the dev server.
- Port detection creates a `SessionEndpoint`.
- Preview pane renders the live app.
- Logs and terminal are visible.
- Checkpoints persist as git commits pushed to a hidden managed repo.
- Checkpoint capture thumbnails.
- Restore by checkpoint.
- Publish/share through endpoint access mode.
- Optional export or handoff actions, such as "open as coding session" or "push to
  GitHub", when the user explicitly wants to keep developing the app elsewhere.

### Creation and Runtime

Requirements:

- `startSession(kind: app)` rejects linked repos and source sessions at initial creation.
- App sessions force cloud hosting.
- App sessions provision a runtime immediately.
- The initial user prompt is preserved and replayed after workspace bootstrap if the
  runtime is not ready yet.
- Runtime setup should inject enough context for Trace-managed git remotes, including
  `TRACE_SERVER_PUBLIC_URL` and runtime auth token when needed.

### Starter

Preferred v1 starter:

- Next.js App Router.
- Tailwind configured.
- shadcn-compatible UI primitives.
- pnpm.
- Port 3000 by default.
- `trace.tokens.json` or equivalent token file.
- `data-trace-source` stamping helper/transform.
- Scripts: `dev`, `build`, `lint`, `typecheck`, and a smoke script if useful.
- Simple persistence seam and API route/server action examples.
- Marker file such as `.trace/app-starter.json`.

Starter application:

- The runtime image should contain the starter, for example `/opt/trace/app-starter`.
- The bridge copies the starter into the app working directory.
- If absent, install dependencies or use prewarmed dependencies.
- Commit an initial starter checkpoint when appropriate.
- The agent then modifies a real project instead of scaffolding from zero.

### App Prompt Overlay

App sessions use the vendored Open Design composer plus Trace app overlay.

The overlay must tell the agent:

- Build a full-stack app, not a static HTML artifact.
- Use the provided starter.
- Preserve source-location stamps for the element picker.
- Run the dev server.
- Keep logs and terminal useful.
- Commit meaningful checkpoints.
- Respect publish/share expectations.
- Use project files as source of truth.

### Live Preview, Logs, and Terminal

Requirements:

- Bridge watches listening ports.
- Denylist internal/system ports.
- First detected app server port creates/enables a `SessionEndpoint`.
- Preview iframe uses endpoint proxy auth for private endpoints.
- Public publish flips the endpoint access mode.
- Logs are persisted as process/log events and rendered without refetch.
- Terminal opens in the app workdir and supports commands needed for debugging.
- Endpoint authoring overlay reports `data-trace-source` selection and script errors to
  the app shell.

### Checkpoints, Captures, and Restore

Requirements:

- Checkpoints are backed by pushed git commits.
- First checkpoint lazily creates the managed repo if none exists.
- Later checkpoints reuse the managed remote.
- On checkpoint, trigger capture of the live app endpoint with headless Chromium.
- Store PNG capture metadata on `GitCheckpoint`.
- Validate PNG signature before upload.
- Rewritten checkpoints clear stale capture metadata when fresh capture is unavailable.
- Restore by checkpoint provisions a fresh app session from the managed repo and SHA.
- Restore preserves `kind: app` even if the UI does not explicitly pass kind.

### Publish, Share, and Optional Handoff

Publish v1:

- `publishAppSession(sessionGroupId)` flips the primary enabled endpoint to public.
- Event payload carries endpoint URL and access mode.
- Public endpoint must render without private session auth or authoring overlay.

Sharing is a first-class successful outcome. The app may remain a Trace-hosted,
managed-git-backed creation indefinitely.

Optional handoff:

- "Open as coding session" links a coding session to the app session group/repo when the
  user asks to continue implementation as repo-bound coding work.
- "Push to GitHub" creates/mirrors to a GitHub repo through existing integration when the
  user asks to own or develop the source outside Trace.
- Provider flips from `managed` to `github` only after mirror succeeds.
- Failed mirror leaves the managed repo unchanged.

## Managed Git

Managed git exists to make generated session outputs durable without forcing GitHub repo
creation. It supports the same core working-directory/remote shape across session kinds:

- **App sessions**: a cloud runtime working directory pushes commits through smart-HTTP.
- **Design sessions**: a bridge/session working directory contains generated design
  source and artifact files and pushes commits through the same managed remote. No app
  server or port detection is required.

### Repo Provider

Add or finish:

```prisma
enum RepoProvider {
  github
  managed
}
```

Rules:

- Managed repos are hidden from normal repo lists and pickers.
- Managed repos are visible to session/checkpoint services.
- Design managed repos are visible to artifact/export/publish/promotion services.
- GitHub-specific webhook/PR logic gates on `provider === "github"`.
- Types come from Prisma/GraphQL codegen. Do not duplicate enums locally.

### Smart-HTTP

Required routes:

```txt
GET  /git/:orgId/:repoId.git/info/refs?service=git-upload-pack
GET  /git/:orgId/:repoId.git/info/refs?service=git-receive-pack
POST /git/:orgId/:repoId.git/git-upload-pack
POST /git/:orgId/:repoId.git/git-receive-pack
```

Requirements:

- Validate/auth through service layer before spawning git.
- Resolve bare repo path from validated ids.
- Do not concatenate untrusted shell strings.
- Spawn `git upload-pack --stateless-rpc` or `git receive-pack --stateless-rpc`.
- Return correct smart-HTTP content types and packet-line framing.
- Runtime tokens are scoped to org/session/repo and expire with the runtime.
- User clone/export tokens are short-lived and auditable.
- After receive-pack, inspect updated refs and call service methods for events.

### Storage and Lifecycle

- Bare repos live under `GIT_STORAGE_ROOT`.
- Design and app managed repos use one main/default branch by default. Do not create
  per-session branches or git worktrees for v1 because each generated session group owns
  exactly one project.
- Checkpoints are commits on that default branch, addressed by commit SHA. Restore can
  clone/check out a commit into a fresh working directory when needed.
- v1 can use a durable mounted volume with one writer.
- Add a small storage adapter seam for path/init/delete.
- Periodic `git gc`.
- Per-org quota checks.
- Backup/snapshot runbook.
- Archive/retention cleanup deletes managed bare repos after the configured window.

### Design Workspace Repo

Design sessions should use the same working-directory/remote pattern as coding sessions,
with a different renderer:

1. Start `SessionGroup.kind === "design"`.
2. Create or reserve hidden `Repo { provider: managed }`.
3. Initialize the managed bare repo under `GIT_STORAGE_ROOT`.
4. Ask the bridge/session adapter to create a design working directory for the group.
5. Set that directory's `origin` to the Trace managed git URL.
6. Generate or update artifact files in that folder.
7. Commit with subjects like `Add design artifact <artifactId>` or
   `Update design canvas layout`.
8. Push to the managed remote.
9. Persist the repo link on `SessionGroup` and artifact git pointers on `Artifact`.
10. Append artifact/layout completion events and broadcast state.

The bridge folder is disposable. If the design session is deleted, archived past
retention, or the runtime/bridge cleanup runs, delete the local working directory. The
managed repo remains the durable copy until retention GC deletes it.

Fan-out behavior:

- A fan-out can use one commit containing all sibling artifact files when they complete
  together.
- If variants complete independently, separate commits are acceptable.
- Partial failures must not prevent successful artifact commits.

Retry/idempotency:

- Do not create duplicate managed repos for the same design session group.
- Do not create duplicate artifact rows/files for the same completed generation attempt.
- If repo creation succeeded but bridge folder setup or commit/push failed, retry against
  the same repo.
- If the bridge folder was deleted, recreate it by cloning the managed repo.

### Lazy App First Checkpoint

First checkpoint flow for an app session:

1. Detect app session group has no repo.
2. Create hidden `Repo { provider: managed }`.
3. Initialize bare repo under `GIT_STORAGE_ROOT`.
4. Mint/reuse runtime-scoped token.
5. Ask bridge/runtime to add or update `origin` to the managed URL.
6. Commit locally if needed.
7. Push the default branch after the checkpoint commit.
8. Persist repo link on `SessionGroup`.
9. Create `GitCheckpoint`.
10. Append events and broadcast state.

Retry/idempotency:

- Do not create duplicate managed repos for the same app session group.
- If repo creation succeeded but bridge push failed, retry against the same repo.
- Later checkpoints skip repo creation.
- Abandoned sessions with no checkpoint create no managed repo.

## Open Design Harness

Trace uses Open Design as a prompt composer and content library.

### Inspirations from Open Design

A read of the upstream Open Design source informed several decisions in this plan. What
their implementation does:

- **Artifacts are files.** The agent writes `index.html`, `screens/*.html`, images, CSS,
  and JS into the project; their daemon detects artifact production via filesystem diffs.
  This validates Trace's managed-repo/working-directory model for design sessions.
- **Their prompts push screen-file-first** (each user-facing screen its own HTML file,
  `index.html` as launcher/overview). Trace deliberately does not copy this as canvas
  UX — see Rejected Paths — but keeps the underlying idea of screens as separate source
  files.
- **They ship a dedicated Claude Design importer** that detects `design-canvas.jsx`,
  preserves exported files, and rewrites Claude's wheel/gesture handling. This is strong
  evidence the Claude canvas artifact is a portable pattern worth being natively
  compatible with.
- **Two-layer data model:** a basic artifact manifest (`kind`, `title`, `entry`,
  `renderer`, `exports`, `supportingFiles`, provenance) plus a stricter "live artifact"
  model (`.live-artifacts/<id>/` with template/data/provenance) for refreshable
  dashboards. The live model is explicitly out of scope for design sessions.
- **Export handoff is their best idea to copy:** ZIP export includes `index.html`,
  `DESIGN-MANIFEST.json` (screen map, source files, tokens, interactions, responsive
  viewport checklist, implementation notes), and `DESIGN-HANDOFF.md`. Trace adopts this
  as `design-manifest.json` + `DESIGN-HANDOFF.md` in the design repo and ZIP export.

### Vendoring

- Vendor prompt modules under `packages/shared/src/design/vendor`.
- Keep vendored files diffable against the pinned upstream tag.
- Do not edit vendor files for Trace behavior.
- Add `LICENSE`, `NOTICE`, and `VENDOR.md`.
- Copy only needed contract/type subsets.
- Stub media generation models for v1 if image generation is not supported.

### Content

- `skills/` and `design-systems/` are deployment assets, not copied wholesale into the
  Trace repo.
- Server image and app runtime image can read content from `/opt/trace/design-content`.
- Loader reads multiple roots from `TRACE_DESIGN_CONTENT_DIRS`.
- Keep upstream file formats:
  - `SKILL.md`
  - `manifest.json`
  - `DESIGN.md`
  - `tokens.css`
  - `USAGE.md`
  - `components.manifest.json`

### Trace Overlay

Expose a helper like:

```ts
composeTraceDesignPrompt({
  kind,
  designSystemId,
  skillIds,
  userBrief,
  artifactContext,
  elementAnchors,
  appStarterContext,
})
```

Design overlay:

- Primary target: a React canvas artifact using the
  `DesignCanvas`/`DCSection`/`DCArtboard` primitives.
- Thin `src/design-canvas.jsx` containing only board structure; every screen/artboard
  body lives in its own component file under `src/components/*`. The overlay must state
  this explicitly so iterations edit small files instead of re-emitting one giant canvas
  file.
- Emit `design.canvas.json` alongside the source with matching section/artboard ids; the
  sidecar is the authoritative canvas metadata and a source/sidecar mismatch fails the
  generation.
- Emit/maintain `design-manifest.json` and `DESIGN-HANDOFF.md`.
- Self-contained output: no imports beyond the provided runtime, no build-step
  assumptions (code must run under in-browser Babel transpilation).
- `:root` CSS variables (token tweaks depend on this).
- Stable `data-el` ids.
- Canvas section metadata: concise title, explanatory description, artifact/frame labels,
  and intended placement/grouping for each generated artifact.
- Print-ready deck structure when applicable.
- No external network unless policy allows it.
- No filesystem assumptions.
- Plain self-contained HTML remains acceptable for simple single-artifact briefs.

App overlay:

- Full-stack app, not static artifact.
- Provided starter/project structure.
- Routes, server/API behavior, persistence seam.
- Run/publish/checkpoint expectations.
- Source-location stamping for picker.

Delivery:

- Design uses composed prompt as direct `LLMAdapter` system/developer prompt.
- App uses `RunOptions.appendSystemPrompt`; Claude Code maps this to
  `--append-system-prompt`.
- Do not introduce a production `OpenDesignAdapter`.

## Design Systems

Design systems are selected per design/app session group through `designSystemId` and
`designSkillIds`.

Rules:

- Picker options come from the same content roots used for prompt composition.
- Settings update through service-layer mutation.
- Only `design` and `app` groups can change harness settings.
- Updates emit session-scoped snapshot/update events.
- Future org-derived design systems use the same directory format as upstream content.
- Future extraction from org repos should produce a standard design-system directory, not
  a new composer format.

## Frontend State and UI Rules

- Events are the source of truth.
- Add artifact/comment/export/process/endpoint/checkpoint reducers to Zustand.
- Mutations are fire-and-forget for shared state.
- Components should take ids and use fine-grained selectors.
- Virtualize long lists.
- Reuse existing chat/session components instead of reinventing chat.
- Design mode uses existing chat left rail plus canvas.
- App mode uses preview/logs/terminal/checkpoint/application UI.
- Keep generated artifacts and endpoint iframes isolated by origin/proxy rules.

## Current Implementation Status

`docs/design-app-session-implementation-audit.md` says the main server/service/UI paths
for design and app sessions have been implemented and covered by focused tests in the
current branch lineage. That audit predates the latest decision that design artifacts
should use the same managed repo + bridge working-directory pattern as coding/app sessions. If the
current code still stores design HTML only in blob/object storage or commits it only from
server-side temporary state, another implementation pass should migrate the durable
source to a managed design working directory while preserving any existing cache/fallback
paths.

After that storage decision is implemented, the remaining proof is hosted end-to-end
verification:

- `pnpm smoke:design-session`
- `pnpm smoke:cloud-app-session`

Because implementation may continue across branches, another agent should first audit
the current codebase against this master plan and the audit doc before assuming whether a
given item is still missing.

Known unrelated test note:

- `src/routes/slack.test.ts` has an unrelated deleted-worktree thread notice assertion
  failure. Treat it as out of scope unless implementation touches that path.

## Verification Plan

The feature is not complete until automated and hosted evidence proves the workflows
work end to end.

### Required Design Evidence

- Service/bridge test: `startSession(kind: design)` creates or reserves a hidden managed
  repo and materializes a bridge working directory on the default branch, but does not
  start an app dev server or port detection flow.
- Service test: design generation calls `LLMAdapter` and persists N artifacts.
- Service/store test: design generation can persist AI-authored canvas sections with
  titles, descriptions, and artifact membership.
- UI test: canvas renders sections with headings/descriptions and grouped artifact cards.
- Sidecar/service test: a generated `design.canvas.json` ingests into `CanvasSection`
  and `Artifact` state, and a sidecar whose section/artboard ids are missing from the
  JSX source fails the generation attempt (consistency validation, not JSX scraping).
- Browser test: a React canvas artifact renders in the user-content iframe via
  in-browser Babel transpilation, with no server-side compile step involved.
- Service/integration test: design artifact generation writes HTML/metadata files into
  the design working directory and pushes them to the managed remote.
- Retry test: failed design bridge setup or commit/push reuses the same managed repo on
  retry, and deleted bridge folders can be recloned from the remote.
- Service test: failed one-of-N generation keeps successful siblings visible.
- Service test: iteration includes parent artifact source/HTML and anchor/comment
  context.
- Store test: design events upsert artifacts/comments/exports.
- Browser route test: `_bootstrap` does not leak content.
- Browser test: artifact iframe renders through user-content origin and postMessage.
- Browser test: comments/pins render inside authoring preview.
- Service test: token tweak preserves unpatched variables and creates child artifact.
- Integration test: PDF export creates a valid non-empty PDF and emits completion only
  after upload.
- Route test: published artifact root serves stored HTML; unpublished root does not.
- Git test: published/exported artifact HTML resolves from the artifact commit pointer.
- Export test: "Download HTML" produces a self-contained `design.html` bundle that opens
  offline, unpacks embedded assets, transpiles React canvas source with the embedded
  babel-standalone, and shows runtime errors visibly if unpacking fails.
- Export test: "Download ZIP" contains the bundle, source files, `design.canvas.json`,
  `design-manifest.json`, and `DESIGN-HANDOFF.md`.
- Service/UI test: promotion creates linked coding session with artifact references, and
  for React canvas artifacts the promotion payload includes the component source and
  manifest/handoff files rather than only flat HTML.

### Required App Evidence

- Service test: `startSession(kind: app)` rejects user repo and forces cloud.
- Runtime test: starter exists, installs, builds, and runs.
- Bridge/service test: detected port creates `SessionEndpoint`.
- Browser test: preview iframe renders app content.
- Store/UI test: logs, process state, endpoints, publish state update from events.
- Terminal test: command executes in app workdir.
- Managed-git integration test: clone/push/fetch through smart HTTP.
- Checkpoint test: first checkpoint creates exactly one managed repo and pushes.
- Retry test: failed bridge delivery reuses existing managed repo.
- Capture test: app checkpoint capture validates PNG bytes.
- Restore test: restored app session checks out checkpoint SHA and renders.
- Publish test: public endpoint renders without private auth.
- Graduation test: GitHub provider flips only after mirror succeeds.

### Hosted Smoke Commands

Design:

```bash
TRACE_SMOKE_SERVER_URL=https://gettrace.org \
TRACE_SMOKE_AUTH_TOKEN=<session-token> \
TRACE_SMOKE_ORG_ID=<organization-id> \
pnpm smoke:design-session
```

The design smoke must start a fresh design session, verify a hidden managed repo and one
bridge working directory on the default branch are created without starting an app dev
server, wait for model-generated artifacts, create fan-out variants, add anchored
comment, tweak tokens, export and download a PDF, publish and open the public URL,
delete/recreate the bridge folder from the managed remote, and promote to coding.

App:

```bash
TRACE_SMOKE_SERVER_URL=https://gettrace.org \
TRACE_SMOKE_AUTH_TOKEN=<session-token> \
TRACE_SMOKE_ORG_ID=<organization-id> \
pnpm smoke:cloud-app-session
```

The app smoke must start a fresh app session, wait for cloud runtime/starter/process
logs/enabled endpoint/managed checkpoint/capture, verify terminal in the app workdir,
open private preview in a browser, verify managed git remote/clone, publish public
endpoint, open the public URL unauthenticated, restore checkpoint, and open restored
preview.

Debug-only flags such as `TRACE_SMOKE_SKIP_BROWSER=1` are not acceptable for final
completion.

## Full Completion Gate

Do not call the full goal complete until:

- Design and app session kinds work from the UI and service layer.
- All mutating behavior flows through services and events.
- Design generation uses real `LLMAdapter` output, not placeholders.
- Design generation targets React canvas source with an authoritative
  `design.canvas.json` sidecar, rendered via in-browser Babel with no server-side
  compile pipeline.
- Design artifact preview/publish uses the user-content domain in production.
- Design canvas renders AI-authored section titles/descriptions and grouped canvases.
- PDF export produces real downloadable PDF files.
- App sessions run real standalone apps on cloud runtimes.
- App sessions use managed git durability and lazy first-checkpoint repo creation.
- Design sessions use managed git durability with one bridge working directory on the
  default branch, and deleting the bridge folder does not lose artifacts because the
  managed remote can recreate it.
- Checkpoint restore and publish work for app sessions.
- Prompt harness composition is wired for both session kinds.
- Existing coding-session behavior still works.
- Focused tests pass.
- Hosted `pnpm smoke:design-session` and `pnpm smoke:cloud-app-session` pass against a
  configured Trace server.
