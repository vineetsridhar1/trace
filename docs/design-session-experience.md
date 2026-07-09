# Session Kinds: Design & App

Status: design exploration (2026-07-08). Companion to `managed-git-hosting.md` (where the
code lives) and `open-design-harness-integration.md` (the prompt harness). Target mock:

![Design session mock](./assets/design-session-mock.png)

## The split

What started as one "web design session" is two products, and forcing them into one spec
compromised both (the HTML-vs-React stack tension was the symptom). They share ~80% of
their substrate, so they ship as two `SessionGroup.kind`s on one foundation:

- **`design` — the artifact tool** (Claude Design shape). Output is the artifact itself:
  screens, mockups, decks, brand explorations as self-contained HTML. You look at it,
  comment on it, present it, export it (PDF), and hand it off as *intent*. No dev server,
  no build step — instant first render, every version permanently live.
- **`app` — the app builder** (Replit shape). Output is a running application: React
  starter, dev server + HMR, live endpoint preview. It's supposed to grow up into real
  code — "To code session" on the same worktree is the differentiator.

The boundary case is deliberate: **Promote to app session** takes a design artifact and
starts a linked `app` session whose first agent task is porting the mockup into the React
starter. A visible transition between kinds (links in the flat entity model), not an
invisible mid-session stack swap.

Sequencing: **design kind first.** It needs strictly less new infrastructure (no port
detection, no starter-kit hardening, no picker build plugin), runs the Open Design content
in its native HTML habitat (de-risks the harness spike), and builds the shared shell that
the app kind then inherits.

## Shared substrate (both kinds)

### Cloud-only in v1

Both kinds run **only on cloud (provisioned) runtimes**. This matches existing gates
(application/endpoint forwarding is already cloud-only via `resolveCloudRuntime()`) and
buys: one runtime image (templates, headless Chromium, harness content), a safely
permissive agent sandbox (disposable machine → aggressive auto-run → fast
prompt-to-preview loop), and no local preview plumbing. Enforced at one choke point: for
these kinds `SessionService.startSession` forces `hosting: cloud`, requires a
`provisioned` environment, rejects local runtime selection; the UI hides the
hosting/runtime picker. Local support, if ever wanted, is a later adapter-level project.

### Standalone, repo-less, agent-run

Neither kind runs in the context of an existing org repo:

- **No `repoId` at creation.** Prompt-first: `startSession(kind, prompt)`. No inheritance
  of the channel's default repo. The workspace starts as an empty directory; the managed
  repo appears lazily at the first checkpoint (per `managed-git-hosting.md`).
- **The agent owns the bootstrap.** Repo `setupConfig`/setup scripts don't apply. The
  agent scaffolds from the kind's template in the runtime image and runs whatever needs
  running. Template-dependent features degrade gracefully off-template.

### Harness

Both kinds compose their system prompt from the vendored Open Design layer stack
(designer charter + skills + `DESIGN.md` design systems) delivered via
`--append-system-prompt` on plain `claude_code` — full plan in
`open-design-harness-integration.md`. `designSystemId` binds the org's brand (or one of
153 presets); future org-repo design-system extraction is spec'd there. The critique panel
and discovery-brief parsing stay out of v1 (first message is the brief).

### Versions = checkpoints

Every run produces a `GitCheckpoint`; the version strip is the checkpoint list renamed for
civilians. Restore = existing `restoreCheckpointId` machinery (restored version becomes
HEAD). How old versions *render* differs by kind (below).

### Comments, Tweaks, preview shell

- **Preview pane** (iframe + device frames + zoom) with short-lived signed-cookie auth for
  private endpoints — shared chrome for both kinds.
- **Comments**: `design_comment_added` events carrying an element anchor (selector +
  source location + version); "send to agent" wraps into a queued message. Anchors pin to
  the version they were made on; best-effort re-anchor on HEAD.
- **Tweaks**: deterministic token edits (`trace.tokens.json` → CSS variables) through a
  service-layer method + bridge write — no model round trip. Templates for both kinds
  expose the same token file; the panel's controls are schema-driven.
- **Element picker**: proxy-injected overlay script captures selector + bbox + cropped
  screenshot and posts it to the composer as a chip. Source identity differs by kind
  (below).

## The `design` kind

- **Template**: self-contained HTML artifacts (screens/decks), served by a static file
  server on the runtime — no install, no build. First render in seconds; the instant-wow
  path. Open Design's HTML-tuned skills (deck frameworks, fixture components) apply
  unmodified.
- **Every version is live.** Static artifacts mean any checkpoint re-renders forever: the
  runtime materializes checkpoint N to a temp dir and serves it. v1…v4 in the strip are
  all interactive, and "Diff v3" can be two live renders side-by-side / onion-skinned —
  no capture infrastructure needed.
- **Element picker**: DOM anchors + the artifact file path (single-file artifacts make
  source location trivial). No build plugin required.
- **PDF export.** The runtime image ships headless Chromium (Playwright — shared with the
  app kind's capture step). An `exportArtifact(sessionGroupId, checkpointSha?, format)`
  service method sends a bridge command; the runtime loads the static artifact over
  loopback in headless Chrome and prints to PDF (`page.pdf()`), honoring print
  stylesheets. The vendored deck-framework prompt contract is what guarantees decks
  paginate correctly — it exists precisely so PDF stitching works. The result flows
  through the existing upload pipeline and a `design_export_completed` event, so it lands
  in the session timeline and is shareable into channels. Because it's a service method,
  agents can call it too — "make a one-pager and post the PDF in #marketing" is a single
  task. v1 exports PDF only; PPTX/video are out (Open Design's video path needs
  HyperFrames/ffmpeg; not worth the image weight yet).
- **Publish/share**: public URL for the artifact (endpoint `accessMode: public`), Spotlight
  presentation mode later.
- **Promote to app session**: creates a linked `app` session; the artifact becomes the
  brief + visual reference for the port.

## The `app` kind

- **Template**: React + Vite + Tailwind + shadcn starter (`trace.tokens.json`,
  source-location Vite plugin, pre-warmed node_modules). Agent's default, not a fixed
  pipeline — "make me a Next.js app" still works.
- **Port auto-detection** replaces config-driven process start: the bridge watches for new
  listening ports (denylist: bridge + daemon/system ports), reports them, the service
  layer auto-creates and enables a `SessionEndpoint`, the preview lights up. Agent can
  also register explicitly via tool call.
- **Versions**: HEAD is live via the dev server; older versions are **captures**
  (full-page screenshots at checkpoint time via the shared headless Chromium). Visual diff
  = capture pair; code diff behind a toggle.
- **Element picker**: the Vite plugin stamps `data-trace-source="src/components/ApprovalTable.tsx:42"`,
  so chips carry component identity + file:line — what makes "click the thing, say the
  change" reliable in a component tree.
- **Graduation**: "To code session" starts a coding-kind session in the same
  `SessionGroup` (shared worktree); pushing the managed repo to GitHub offered but not
  required.
- **Publish v1**: endpoint `accessMode: public`; later real deploy (build + CDN upload).

## Mapping the mock to the architecture

| Mock element | Backing primitive | Status |
|---|---|---|
| Live preview iframe | `SessionEndpoint` + endpoint proxy | exists — needs iframe embed + auth |
| App boots with no config | agent-run scaffold (+ port auto-detection, app kind) | ★ new |
| Versions v1…v4 | `GitCheckpoint` per run | exists — needs UI (+ captures, app kind) |
| Diff v3 | live render pair (design) / capture pair (app) + code diff | partially new |
| Element chip ("ApprovalTable › Row 2") | proxy-injected picker script | ★ new |
| Tweaks (no prompt needed) | deterministic token file edits via bridge | ★ new |
| Comments pinned to elements | events + queued messages | exists — needs anchor payload |
| PDF export | headless Chromium + bridge command + upload pipeline | ★ new (design kind) |
| Publish | endpoint `accessMode: public` | exists (v1); real deploy later |
| To code session / Promote to app | new session in same group / linked group | exists / small extension |
| Code/Design mode toggle | `interactionMode` (add `design`) | small extension |
| $1.12 · 2.1M tok | Session token/cost fields | exists |
| In Review status | group status | later; not load-bearing |

## New surface area

Frontend (`apps/web/src/components/design/`):
- Kind-branching shell from the group route on `SessionGroup.kind`; `PreviewPane`,
  `VersionStrip`, `TweaksPanel`, `ElementChip`, comment pins overlay — shared; export/
  promote actions (design), applications/graduation actions (app)
- Chat rail reuses `SessionInput` / `SessionMessageList` as-is

Server:
- `SessionGroup.kind` (`coding | design | app`) + `StartSessionInput.kind`; design/app
  force `hosting: cloud`, take no `repoId`
- `exportArtifact` service method + `design_export_completed` event
- Auto-create + enable `SessionEndpoint` from bridge port-detection reports (app kind)
- Checkpoint capture step (app kind) / checkpoint materialization for static serving
  (design kind)
- Token-edit service method; `design_comment_added` event type
- Vendored Open Design composer + overlay in `packages/shared`;
  `RunOptions.appendSystemPrompt` → `--append-system-prompt` in `ClaudeCodeAdapter`

Runtime image:
- Design template (static artifact scaffold) + app starter kit (React/Vite/Tailwind/
  shadcn, tokens file, source-location plugin, pre-warmed node_modules)
- Open Design skills + design-systems content from a pinned upstream tag
- Headless Chromium (Playwright) — PDF export + captures
- Listening-port detection (app kind); static artifact server (design kind)
- Proxy HTML injection for picker/comments overlay; iframe endpoint auth

## Phasing

1. **Preview pane**: iframe embed of existing endpoints in the group view +
   private-endpoint iframe auth. Useful for coding sessions today; zero schema change.
2. **Design kind**: `kind` on SessionGroup, design shell, static-artifact template +
   serving, vendored composer + content, lazy managed repo, live version strip, PDF
   export.
3. **Design magic**: element picker + chips, Tweaks, comments, publish/share.
4. **App kind**: React starter + port auto-detection + captures + picker Vite plugin +
   graduation + Promote-to-app from design sessions.
5. **Distribution**: real deploy, Spotlight mode, review statuses, PPTX/video exports if
   demanded.

## Open questions

1. Design-kind multi-artifact projects (a deck + three screens in one session): one
   workspace with multiple artifact files — how the version strip and preview navigate
   between artifacts.
2. Anchor durability — selectors/source stamps drift as the agent rewrites; comments pin
   to their version, best-effort re-anchor on HEAD.
3. Picker/overlay delivery — template-shipped vs. proxy-injected; injection keeps
   templates clean but must not break non-HTML/streaming responses.
4. PDF fidelity gates — page size/margins UI, and whether export runs against HEAD only
   or any checkpoint (plan: any, via materialization).
