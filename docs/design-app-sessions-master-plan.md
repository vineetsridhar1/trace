# Design and App Sessions Master Plan

Status: consolidated product and implementation spec (2026-07-09).

This document consolidates the decisions, tradeoffs, implementation contracts, gap plans,
and verification requirements from the design/app session planning thread. It is intended
to be the single starting point for another AI agent implementing or finishing the full
feature.

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
generate, review, export, publish, and promote HTML artifacts into coding sessions, while
`app` sessions are standalone cloud-run full-stack app builders with live preview,
logs/terminal, managed git durability, checkpoints, restore, publish/share, and optional
graduation.

## Product Split

Trace should support three distinct session kinds:

- **`coding`**: repo-bound implementation work against real product code. This is the
  existing AI coding session model.
- **`design`**: project-facing visual exploration and artifact work. The output is the
  artifact itself: screens, mockups, decks, visual directions, PDFs, and reviewable
  design intent. Design sessions primarily promote into coding sessions.
- **`app`**: standalone runnable software. The output is a live app the user can run,
  inspect, checkpoint, restore, publish, and optionally graduate. App sessions do not
  start from the user's repo and should not be forced through the design artifact model.

The original "web design session" idea split into `design` and `app` because they have
different success criteria:

- Design answers: "What should this look like?"
- App answers: "Can you build me a working standalone app?"
- Coding answers: "Can you change this existing codebase?"

## Key Decisions

- **Design sessions do not need a cloud computer.** They generate self-contained HTML
  artifacts through direct `LLMAdapter` calls and render those artifacts in isolated
  iframes.
- **Design sessions use a canvas.** The primary workspace is a pan/zoom surface where
  multiple AI-generated artifact options can exist side by side.
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
- **Managed git is for app sessions.** Design artifacts live in rows/blob storage; app
  sessions use hidden Trace-managed git repos for durable worktrees and checkpoints.

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
  - `htmlStorageKey` or equivalent blob reference for new HTML storage
  - `metadata`
  - `publishedAt`
  - `createdBy`
  - timestamps
- `DesignComment`: comment/pin entity or event payload tied to artifact/version anchors.
- `Repo.provider`: `github | managed`.
- `GitCheckpoint`: existing checkpoint model, extended with capture metadata for app
  sessions when available.

## Design Sessions

### Product Contract

A complete design session supports:

- Prompt-first creation.
- No runtime provisioning.
- No repo requirement.
- Multiple parallel HTML artifact variants for a brief.
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

Service contract:

- Add or finish a service method like
  `generateDesignArtifacts({ sessionGroupId, sessionId, prompt, baseArtifactIds?,
  elementAnchors?, directionCount?, designSystemId?, skillIds? })`.
- The service loads harness settings, composes the Open Design prompt with Trace overlay,
  calls the configured `LLMAdapter`, streams deltas as session events, persists finished
  artifact HTML, records usage, and appends completion/failure events.
- Fan-out is parallel. A first brief such as "give me three directions" creates sibling
  artifacts. Each direction stores direction metadata.
- Iteration includes parent artifact HTML, selected element anchors, comment context,
  token block, and comparison artifacts when selected.
- Failed variants produce visible failure events/cards without failing successful sibling
  variants.
- There must be no successful placeholder fallback when model credentials fail. Model
  failures emit `design_generation_failed`.

Expected events include:

- `design_generation_started`
- `design_artifact_delta`
- `design_artifact_created`
- `design_artifact_updated`
- `design_generation_failed`
- `design_comment_added`
- `design_export_requested`
- `design_export_completed`
- `design_export_failed`
- `design_artifact_promoted`

Exact event names may follow existing schema conventions, but the event payloads must be
sufficient for Zustand to upsert entities without refetch.

### Artifact Storage

- New artifact HTML should be stored through the existing storage/upload adapter under an
  org-scoped key such as `uploads/{orgId}/design-artifacts/{artifactId}.html`.
- Store the blob key on the artifact row.
- Keep legacy `Artifact.html` fallback for existing rows and generated GraphQL
  compatibility if needed.
- GraphQL and event payloads should hydrate artifact HTML from storage when required by
  the client.
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
- The parent Trace canvas pushes artifact HTML into the frame through `postMessage`.
- The frame replies with readiness, element-selection, pin status, and script-error
  messages.
- Message payloads must include a nonce and validate origins on both sides.
- Published artifact root URLs serve stored HTML directly only when `publishedAt` is set.
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

Design mode should preserve existing primitives:

- Use the existing session chat component, narrowed as a left rail.
- Hide the design/coding tab strip in design mode.
- Auto-collapse the global app sidebar in design mode.
- Hide irrelevant repo/application chrome for design groups.
- Render artifact cards on the right-side canvas.
- Support pan, wheel/trackpad scroll, zoom in/out, fit to canvas, and focus mode.
- Keep zoom responsive enough for natural canvas navigation.
- Cards render artifact iframes, status, title, created time, comments, export/publish
  actions, and generation failure state.
- Element selection should use `data-el` anchors inside artifact HTML.
- Comments/pins belong to the artifact version they were created on.

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

Design PDF export is server-owned because design sessions have no runtime.

Requirements:

- Add/finish a service method like
  `exportDesignArtifact({ artifactId, format: "pdf", pageOptions? })`.
- Use a bounded Playwright/headless-Chromium pool or worker queue.
- Load stored artifact HTML directly from artifact storage.
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
- The coding session receives a concise brief, artifact references, selected HTML or
  summary, and source design group metadata.
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
- Optional "open as coding session" or "push to GitHub" graduation.

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
- The bridge copies the starter into an empty app worktree.
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

### Publish and Graduation

Publish v1:

- `publishAppSession(sessionGroupId)` flips the primary enabled endpoint to public.
- Event payload carries endpoint URL and access mode.
- Public endpoint must render without private session auth or authoring overlay.

Graduation:

- "Open as coding session" links a coding session to the app session group/repo.
- "Push to GitHub" creates/mirrors to a GitHub repo through existing integration.
- Provider flips from `managed` to `github` only after mirror succeeds.
- Failed mirror leaves the managed repo unchanged.

## Managed Git

Managed git exists to make app sessions durable without forcing GitHub repo creation.

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
- v1 can use a durable mounted volume with one writer.
- Add a small storage adapter seam for path/init/delete.
- Periodic `git gc`.
- Per-org quota checks.
- Backup/snapshot runbook.
- Archive/retention cleanup deletes managed bare repos after the configured window.

### Lazy First Checkpoint

First checkpoint flow for an app session:

1. Detect app session group has no repo.
2. Create hidden `Repo { provider: managed }`.
3. Initialize bare repo under `GIT_STORAGE_ROOT`.
4. Mint/reuse runtime-scoped token.
5. Ask bridge/runtime to add or update `origin` to the managed URL.
6. Commit locally if needed.
7. Push checkpoint branch/ref.
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

- Self-contained HTML.
- `:root` CSS variables.
- Stable `data-el` ids.
- Print-ready deck structure when applicable.
- No external network unless policy allows it.
- No filesystem assumptions.

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
current branch lineage. The remaining proof is hosted end-to-end verification:

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

- Service test: `startSession(kind: design)` creates no runtime/repo.
- Service test: design generation calls `LLMAdapter` and persists N artifacts.
- Service test: failed one-of-N generation keeps successful siblings visible.
- Service test: iteration includes parent artifact HTML and anchor/comment context.
- Store test: design events upsert artifacts/comments/exports.
- Browser route test: `_bootstrap` does not leak content.
- Browser test: artifact iframe renders through user-content origin and postMessage.
- Browser test: comments/pins render inside authoring preview.
- Service test: token tweak preserves unpatched variables and creates child artifact.
- Integration test: PDF export creates a valid non-empty PDF and emits completion only
  after upload.
- Route test: published artifact root serves stored HTML; unpublished root does not.
- Service/UI test: promotion creates linked coding session with artifact references.

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

The design smoke must start a fresh design session, verify no runtime/repo, wait for
model-generated artifacts, create fan-out variants, add anchored comment, tweak tokens,
export and download a PDF, publish and open the public URL, and promote to coding.

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
- Design artifact preview/publish uses the user-content domain in production.
- PDF export produces real downloadable PDF files.
- App sessions run real standalone apps on cloud runtimes.
- App sessions use managed git durability and lazy first-checkpoint repo creation.
- Checkpoint restore and publish work for app sessions.
- Prompt harness composition is wired for both session kinds.
- Existing coding-session behavior still works.
- Focused tests pass.
- Hosted `pnpm smoke:design-session` and `pnpm smoke:cloud-app-session` pass against a
  configured Trace server.
