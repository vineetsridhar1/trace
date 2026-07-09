# Session Kinds: Design & App

Status: design exploration (2026-07-08). Companion to `managed-git-hosting.md` (managed
repos — app kind) and `open-design-harness-integration.md` (the prompt harness). Target
mock (depicts the focused single-artifact view; the design kind adds a canvas level above
it):

![Design session mock](./assets/design-session-mock.png)

## The split

What started as one "web design session" is two products sharing one foundation, shipped
as two `SessionGroup.kind`s:

- **`design` — the project design canvas** (Claude Design shape, Figma-like surface).
  Output is the artifact itself: screens, mockups, decks, and visual directions as
  self-contained HTML, laid out on a spatial canvas where the AI generates **multiple
  options in parallel**. You compare, comment, iterate, export (PDF), and hand off as
  *project intent*. **No cloud machine, no coding agent** — generation is direct model
  calls through the `LLMAdapter`; rendering is origin-isolated iframes on a user-content
  domain. The primary graduation path is **Promote to coding session**: the chosen
  artifact(s) become the brief/reference for implementation in an existing or newly
  linked product repo.
- **`app` — the standalone app builder** (Replit shape). Output is a running
  application: a full-stack app starter on a cloud runtime, dev server + HMR, live
  endpoint preview, logs/terminal, checkpoints, and publish/share. These are standalone
  apps first — not project design artifacts — with managed git as invisible durability.

The boundary case is deliberate: **Promote to coding session** takes a chosen design
artifact and starts a linked coding session whose first agent task is implementing the
design in project code. **Start app session from design** can exist later as an explicit
fork when the user wants a standalone runnable app, but it is not the default graduation
path. A visible transition between kinds (links in the flat entity model), not an
invisible mid-session stack swap.

Sequencing: **design kind first** — it now needs no runtime infrastructure at all (no
machine, no bridge, no port detection), runs the harness content in its native HTML
habitat, and its canvas/comments/versions UI seeds the app kind's shell.

## The `design` kind

### No runtime — generation via LLMAdapter

A design session runs **no compute session anywhere**. The service layer calls the
`LLMAdapter` (Anthropic, etc.) directly with the composed design prompt as the `system`
param; the model streams a self-contained HTML artifact back. Consequences:

- **Zero cold start.** First tokens in ~a second; the artifact paints progressively in its
  card as it streams. No provisioning, no bridge, no daemon.
- **Fan-out is the primitive.** "Give me three directions" = three parallel streaming
  calls (same brief, direction-differentiated prompts — Open Design's direction library
  feeds exactly this). Cost is tokens only, not machine-minutes, so parallel options are
  the default UX, not a luxury.
- **No git, no managed repo.** Artifacts are entities: an `Artifact` row (id, session
  group, parent artifact, prompt/message refs, metadata) with the HTML body in object
  storage via the existing upload pipeline. Versions/variants form a **lineage DAG** via
  `parentArtifactId` — a variant fan-out is N siblings; an iteration is a child. (Managed
  git hosting remains motivated by the app kind; see `managed-git-hosting.md`.)
- **Iteration mechanics**: v1 regenerates the artifact (with prompt caching and the prior
  HTML + element context in the request); structured edit-ops are a later optimization if
  regen cost/fidelity warrants.
- Sessions/timeline still work as today — prompts, streams, and completions are session
  events; a design session is a session with no runtime attached. Generation usage
  records into the existing session token/cost fields (the mock's `$1.12 · 2.1M tok`
  badge), summed across fan-out calls.

#### Generation implementation contract

This is one of the known remaining gaps. The docs target is **not complete** until design
sessions use real `LLMAdapter` generation instead of seed/demo artifacts.

- **Creation flow**: `startSession(kind: design)` creates a `SessionGroup` + first
  `Session` with no `hosting`, no bridge, no runtime instance, and no repo. The first
  user prompt immediately enters the design generation service.
- **Service method**: add a service-layer method such as
  `generateDesignArtifacts({ sessionGroupId, sessionId, prompt, baseArtifactIds?,
  elementAnchors?, directionCount?, designSystemId?, skillIds? })`. GraphQL mutations and
  agents both call this service; neither creates events or artifact rows directly.
- **Prompt composition**: the service loads `designSystemId`/`skillIds`, calls the
  vendored Open Design composer + Trace overlay (see
  `open-design-harness-integration.md`), and passes the composed output as the `system`
  prompt to the configured `LLMAdapter`.
- **Fan-out**: `directionCount` parallel calls create sibling artifacts with the same
  `parentArtifactId` (or `null` for first-generation directions). Direction labels and
  differentiating prompt hints should be stored in artifact metadata so the canvas can
  explain why variants differ.
- **Streaming**: model deltas produce session-scoped stream events that the web client can
  render immediately into artifact cards. On completion, the service extracts/sanitizes
  the final HTML, writes it through the artifact storage path, creates/updates the
  `Artifact` row, appends the completion event, and records token/cost usage on the
  session.
- **Iteration**: follow-up prompts include the selected artifact HTML, artifact metadata,
  selected element anchors (`data-el`, bounding box, text snippet), and any selected
  comparison artifacts. The result is a child artifact with `parentArtifactId` pointing at
  the primary selected artifact.
- **Failure behavior**: failed variants create failure events tied to their requested
  direction, without failing sibling variants. The canvas should show partial success.
- **Verification**: tests must prove a design prompt calls an `LLMAdapter` mock, emits
  stream/completion events through the service layer, persists an `Artifact`, records
  usage, and supports N-way fan-out.

### Artifact serving: user-content domain

Artifacts render in iframes pointed at a **wildcard user-content domain** —
`https://<artifactId>.<trace-usercontent-domain>/` — which serves a bootstrap shell for
previews and artifact content only once published (the claudeusercontent.com pattern).
Rationale and consequences:

- **Real origin isolation.** AI-generated HTML/JS is untrusted; a unique subdomain per
  artifact gives each one a genuine origin — full web platform inside (localStorage,
  scripts), hard isolation from the Trace app and from other artifacts. (`srcdoc` alone
  either cripples artifacts — no `allow-same-origin` — or inherits our origin, which is a
  hole. It remains a dev-mode fallback only.)
- **Server-set security headers**: strict CSP (external-fetch allowlist decided centrally),
  Permissions-Policy, COOP. The iframe still carries `sandbox` (now safely with
  `allow-same-origin`) as defense in depth.
- **Push, don't serve, for preview** (verified claude.ai behavior: navigating to a
  `_bootstrap` URL directly shows nothing — it's a static shell awaiting `postMessage`).
  The user-content domain serves only a tiny bootstrap document; the canvas pushes
  artifact HTML into the frame over `postMessage`. The client already holds the bytes —
  generation streams in over the session event subscription — so preview needs no server
  round-trip, paints progressively while streaming, and needs **zero auth on the
  cookieless user-content domain**: unpublished artifact bytes are simply never fetchable
  there, and a leaked frame URL is worthless. The same channel carries element-picker
  events, comment-pin rendering, and script-error capture (errors surface to the agent).
- **Publish = flip to served mode.** Publishing an artifact makes the same subdomain URL
  return the stored HTML directly (public flag; optionally signed-token serving later for
  private "open in new tab"). Preview and publish share the domain and headers, not the
  delivery path. Published view is clean output by default; authoring preview keeps the
  bootstrap channel and overlay.
- **Overlay symmetry**: the picker/comments overlay is injected only for authoring
  previews at this serving layer, exactly as the endpoint proxy injects it for app-kind
  dev servers — one overlay script, two injection points.
- Ops: wildcard DNS + TLS on a dedicated domain (never a subdomain of the app domain —
  cookie scoping is the point); can share infrastructure with the endpoint-proxy URLs.

#### User-content implementation contract

This is one of the known remaining gaps. `srcDoc`/plain iframe preview is acceptable only
as a local-development fallback; the production target requires the user-content domain.

- **Host model**: configure `TRACE_USER_CONTENT_DOMAIN` separately from the Trace app
  domain. The server must resolve wildcard hosts like
  `<artifactId>.<TRACE_USER_CONTENT_DOMAIN>` and map the subdomain to an artifact id.
- **Bootstrap route**: unpublished/authoring previews load a tiny HTML shell from
  `https://<artifactId>.<domain>/_bootstrap`. Direct navigation to this URL intentionally
  shows no artifact content. The shell waits for parent-window `postMessage` payloads.
- **Preview protocol**: the parent canvas sends messages such as
  `{ type: "trace:artifact:render", html, overlayEnabled, nonce }`; the frame replies with
  `{ type: "trace:artifact:ready" }`, `{ type: "trace:artifact:element-selected", anchor
  }`, and `{ type: "trace:artifact:error", message, stack }`. Validate message origin on
  both sides.
- **Publish route**: published artifacts serve stored HTML directly from
  `https://<artifactId>.<domain>/`. Authoring overlay scripts must not be injected in the
  public published view unless an authenticated authoring token explicitly requests it.
- **Security headers**: all responses from the user-content domain must be cookieless and
  set CSP, Permissions-Policy, Referrer-Policy, and COOP/COEP as appropriate. The app
  iframe should still use `sandbox` with only the capabilities required for prototypes
  (`allow-scripts`, `allow-same-origin`, and explicitly justified additions).
- **Storage boundary**: unpublished artifact bytes are fetched by the authenticated Trace
  app and pushed into the bootstrap frame; they are not directly fetchable from the
  user-content domain. Published bytes are read through a public serving path gated by the
  artifact's publish state.
- **Verification**: tests must prove direct `_bootstrap` navigation does not leak content,
  unpublished artifact HTML is delivered only through parent `postMessage`, published
  artifacts render from the direct URL, and security headers are present.

### The canvas

The workspace is a pan/zoom spatial surface (Figma mental model):

- **Cards** are artifacts — each an iframe on its user-content origin (see above), with
  the canvas pushing the artifact HTML in over the bootstrap channel. Variants sit
  side-by-side; iterations stack as lineage (expandable history per card). Device-frame
  and zoom per card.
- **Selection drives the composer.** Select a card → prompts iterate on it ("darker,
  same layout"); select two → comparative prompts ("merge A's header with B's palette");
  select none → new artifacts. Element-level selection inside a card (DOM anchors — no
  build plugin needed for static HTML) attaches chips exactly as before.
- **Focus mode** = the mock's layout: one card fills the pane, version strip = its
  lineage, chat rail beside it.
- **Comments** pin to cards or elements within them (`design_comment_added` events with
  artifact id + anchor); "send to agent" queues a generation on that artifact.
- **Tweaks** stay no-model: design-kind artifacts declare tokens as CSS variables (the
  composed prompt mandates it), so the Tweaks panel patches the variable block — a
  deterministic string edit server-side, new artifact version, instant re-render.

### Exports and exits

- **PDF export**: a server-side headless Chromium worker (not per-session — a small
  render pool the server owns) loads the stored artifact and prints it in an isolated
  browser context with no Trace credentials and the same network/CSP policy as preview;
  decks paginate correctly because the vendored deck-framework contract mandates
  print-ready structure. Output flows through the upload pipeline +
  `design_export_completed` event → timeline, shareable to channels; agents can call the
  same service method. v1: PDF only.
- **Publish/share**: artifacts are already stored server-side — a public artifact URL is
  a read endpoint with an access flag. Spotlight presentation mode later.
- **Promote to coding session**: selected artifact(s) become the brief + visual reference
  of a linked coding session for project implementation.
- **Start standalone app**: optional later bridge that uses selected artifact(s) as the
  brief/reference for a new `app` session.

#### PDF implementation contract

This is one of the known remaining gaps. The product target requires real PDF binaries,
not a placeholder event.

- **Service method**: add `exportDesignArtifact({ artifactId, format: "pdf",
  pageOptions? })` in the service layer. GraphQL and agents call this service; it appends
  events and uploads the resulting file.
- **Render pool**: the server owns a bounded Playwright/headless-Chromium pool or worker
  queue. Do not launch unbounded browsers per request. The runtime image for app sessions
  may also contain Chromium for captures, but design PDF export is server-owned because
  design sessions have no machine.
- **Input**: load the stored artifact HTML from artifact storage, not from an unauthenticated
  public URL. Apply the same CSP/network policy as preview; do not pass Trace cookies or
  credentials into the browser context.
- **Print contract**: honor artifact print CSS, deck page structure, page size, margins,
  and background graphics. Default to PDF only; PPTX/video remain out of scope.
- **Output**: upload the PDF through the existing upload/file pipeline, append
  `design_export_completed` with artifact id, checkpoint/version metadata, file id, byte
  size, and page count if available, and show the export in the session timeline.
- **Verification**: tests must prove the service produces a non-empty PDF buffer/file for
  a stored artifact, uploads it, emits the export event, and handles Chromium failures
  without corrupting artifact state.

Every version is trivially "live" forever — cards render stored HTML; nothing to
materialize, no machine to keep warm. Retention/GC is a row + blob policy, even simpler
than the managed-repo clock.

## The `app` kind

This is where cloud machines earn their keep. Unlike `design`, an `app` session is for
building and running a standalone application end-to-end:

- **Cloud-only, enforced at `startSession`** (forces `hosting: cloud`, `provisioned`
  environment, no `repoId`); the disposable machine justifies the permissive auto-run
  sandbox. Local support remains a later adapter-level project.
- **Agent-run bootstrap**: default to a full-stack starter rather than a static design
  artifact. Strong candidate/default: **Next.js + Tailwind + shadcn**, because app
  sessions should support frontend, routes, server actions/API routes, simple persistence
  adapters, auth-ready scaffolding, and deployable standalone output. Keep the starter
  template pluggable by session kind; do not expose a stack picker in v1 unless there is a
  clear product need.
- **Run the app**: agent scaffolds and starts the dev server; **port auto-detection**
  (bridge watches listening ports, denylisted system ports) auto-creates and enables the
  `SessionEndpoint`; preview pane lights up with HMR, logs, and terminal available.
- **Lazy managed repo** at first checkpoint; versions = `GitCheckpoint`s; HEAD live via
  dev server, older versions as captures (shared headless Chromium); restore via
  `restoreCheckpointId`.
- **Element picker** reads `data-trace-source="src/components/ApprovalTable.tsx:42"`
  stamps for component identity + file:line.
- **Tweaks** = service-layer token-file write through the bridge; HMR reflects <1s.
- **Distribution**: standalone app sessions publish/share their running app. **Publish
  v1**: endpoint `accessMode: public`; later, production deploy/export can graduate from
  the managed repo. "Open as coding session" remains available when the user wants
  deeper code work, but it is not the core success path.
- Harness delivery: composed prompt via `RunOptions.appendSystemPrompt` →
  `--append-system-prompt` on plain `claude_code`.

#### App implementation contract

The docs target is **not complete** until app sessions can create, run, checkpoint, and
publish a standalone app.

- **Creation flow**: `startSession(kind: app)` must force cloud hosting and must not
  require `repoId`. It should create/provision the runtime, start from the app starter,
  and make the prompt the first agent instruction.
- **Starter**: provide a maintained starter template in the runtime image. The preferred
  v1 target is Next.js + Tailwind + shadcn with a simple persistence seam and scripts for
  install/dev/build/start. Keep the template swappable internally, but do not expose stack
  selection in v1.
- **Running preview**: the bridge watches listening ports, deny-lists system/internal
  ports, creates/enables a `SessionEndpoint`, and the web shell renders the app endpoint
  in an iframe with endpoint auth. Logs and terminal remain available for debugging.
- **Checkpoints**: the first checkpoint is the durability moment. If no repo exists yet,
  the service creates the managed repo, initializes the bare remote, configures the
  runtime worktree origin, and pushes the checkpoint. Later checkpoints reuse that remote.
- **Publishing**: v1 publish is endpoint `accessMode: public` for the running app.
  Production deploy/export can come later, but the user must be able to share a live app
  URL from the app session.
- **Verification**: tests/manual smoke must prove an app session starts without a repo,
  runs the starter, exposes a preview endpoint, creates a managed repo on first
  checkpoint, restores from a later checkpoint, and can publish/share the endpoint.

## Shared across kinds

- **Harness**: both kinds compose from the vendored Open Design stack (charter + skills +
  `DESIGN.md` design systems) — see `open-design-harness-integration.md`. Delivery
  differs: `system` param on `LLMAdapter` calls (design) vs. `--append-system-prompt`
  (app). `designSystemId` is a session-group setting; org design-system extraction stays
  the committed future direction.
- **Standalone**: neither kind attaches to an existing org repo at creation;
  prompt-first, no channel-repo inheritance.
- **Comments/Tweaks/preview chrome**: same components, same events; anchors pin to the
  version they were made on.
- **Content in one place**: skills + design systems ship as content the server (design
  kind) and runtime image (app kind) both read — same pinned tag, same formats.

## New surface area

Frontend (`apps/web/src/components/design/`):
- `DesignCanvas` (pan/zoom, artifact cards as sandboxed iframes, selection model, lineage
  expansion, focus mode), `VersionStrip`, `TweaksPanel`, `ElementChip`, comment pins
- App kind reuses the preview-pane/versions/comments chrome against endpoints instead of
  stored artifacts; chat rail reuses `SessionInput` / `SessionMessageList`

Server:
- `SessionGroup.kind` (`coding | design | app`) + `StartSessionInput.kind`
- Design kind: `Artifact` entity (lineage DAG, blob refs), generation service on
  `LLMAdapter` (streaming, parallel variants), user-content-domain serving (wildcard
  subdomains, `_bootstrap` + `postMessage` push for authoring preview, direct serving on
  publish, overlay injection only in authoring preview), token-patch method
  (CSS-variable string edit), headless-Chromium render pool (PDF + card thumbnails),
  `design_export_completed` + `design_comment_added` events
- App kind: cloud-only enforcement, port-detection endpoint auto-registration, checkpoint
  captures, bridge token-file write, `RunOptions.appendSystemPrompt`, endpoint-proxy
  overlay injection + private-endpoint iframe auth (signed cookie)
- Vendored Open Design composer + overlay in `packages/shared` (used by both delivery
  paths)

Runtime image (app kind only): starter kit, harness content, headless Chromium (checkpoint
captures), listening-port detection in the container bridge.

## Phasing

1. **Design kind core**: `kind` on SessionGroup, `Artifact` entity + generation via
   `LLMAdapter` with the vendored composer, canvas with streaming cards + fan-out
   variants, lineage/versions.
2. **Design magic**: element chips, comments, Tweaks (CSS-var patch), PDF export (render
   pool), publish/share.
3. **App kind**: cloud runtime path — full-stack starter kit (Next.js candidate/default),
   port auto-detection, endpoint iframe preview + auth, logs/terminal, captures, picker
   source mapping, lazy managed repo, publish/share.
4. **Distribution**: real deploy (app), Spotlight mode, review statuses, PPTX/video
   exports if demanded.

(The old phase-1 "iframe preview of existing endpoints in the group view" is still a
cheap, independently useful win for coding sessions — it now rides with phase 3.)

## Completion checklist for the full docs target

Another agent should treat the feature as incomplete until all of these are true:

- Design sessions call a real `LLMAdapter` through the service layer, stream artifact
  generation, persist artifact HTML, support fan-out variants, and record token/cost
  usage.
- Design previews use the wildcard user-content domain with `_bootstrap` +
  `postMessage`; direct bootstrap URLs do not leak private artifact bytes; published
  artifacts serve directly.
- Design PDF export produces real uploaded PDF files through a bounded server-side
  headless-Chromium render pool.
- Design canvas supports pan/zoom, card selection, iterations/lineage, existing chat rail
  on the left, hidden design tab strip, and auto-collapsed app sidebar.
- App sessions create standalone cloud runtimes from the full-stack starter, run the app,
  expose live preview/logs/terminal, and publish/share a live endpoint.
- Managed git smart-HTTP exists and app sessions lazily create/push to a managed repo on
  first checkpoint.
- Existing coding-session behavior still works. The unrelated
  `src/routes/slack.test.ts` deleted-worktree thread notice assertion may be tracked
  separately unless implementation touches that path.

## Open questions

1. Artifact size limits and multi-file artifacts (fonts/images) — v1 is single-file with
   inlined assets; revisit if quality demands asset pipelines.
2. Anchor durability across regenerations — the model rewrites the whole document, so
   element anchors re-resolve by stable ids the prompt mandates (`data-el` ids) rather
   than DOM paths.
3. Fan-out defaults — always offer N directions on the first brief vs. only when asked;
   cost/latency vs. wow. Likely: 3 directions on first brief, single-path after.
4. PDF fidelity — page size/margins UI; render-pool sizing, isolation, and external
   network policy on the server.
5. Whether design sessions eventually want an *optional* tool-using agent mode (e.g.
   "research competitors then design") — if so, it's an escalation to a runtime-backed
   run, not the default path.
