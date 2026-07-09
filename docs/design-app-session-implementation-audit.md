# Design and App Session Implementation Audit

Date: 2026-07-09

This audit compares the current implementation against `docs/design-session-experience.md`,
`docs/open-design-harness-integration.md`, and `docs/managed-git-hosting.md`.

## Current Status

The main server/service/UI paths for `design` and `app` sessions are implemented and
covered by focused tests. One item remains important before claiming the complete product
goal is fully verified:

- A real configured cloud app session has not been run through a browser from prompt to
  published URL in this environment.

## Design Sessions

Implemented:

- The Open Design prompt composer is vendored under `packages/shared/src/design/vendor`
  with Apache-2.0 `LICENSE`, `NOTICE`, and `VENDOR.md` rebase metadata.
- `composeTraceDesignPrompt` wraps the vendored composer with Trace overlays for both
  `design` and `app` session kinds.
- `TRACE_DESIGN_CONTENT_DIRS` loads upstream-shaped design-system and skill content for
  prompt composition.
- The same content roots expose a GraphQL-backed design prompt content catalog so clients
  can populate design-system and skill pickers from configured Open Design content.
- Design/app harness settings can be updated after session creation through the service
  layer and GraphQL API, with validation that only `design` and `app` session groups can
  change `designSystemId` and `designSkillIds`.
- The design canvas and app Applications panel expose visible design-system/skill pickers
  that read `designPromptContentCatalog`, display the current `designSystemId` and
  selected skill count, and persist changes through `updateDesignHarnessSettings`.
- `startSession(kind: design)` creates a serverless design group without runtime
  provisioning.
- Initial and fan-out artifact generation call the LLM-backed design generation service.
- Design generation passes the composed Open Design prompt into the configured
  `LLMAdapter` and persists returned HTML artifacts through the service layer.
- New design artifacts write HTML through the existing storage adapter under
  `uploads/{orgId}/design-artifacts/{artifactId}.html` and store the blob reference in
  `Artifact.htmlStorageKey`; the legacy `Artifact.html` column remains a fallback for
  pre-migration rows and generated GraphQL compatibility.
- Artifacts preserve lineage through `parentArtifactId` and event payloads include full
  artifact data.
- The design canvas uses the existing session/chat shell, renders artifact variants on a
  pan/zoom canvas, and supports focus/fit/zoom controls.
- Design groups suppress the coding tab strip and right-side repository/application
  chrome, leaving the existing chat rail on the left and the canvas as the primary work
  surface.
- Artifact previews use the user-content `_bootstrap` iframe flow when configured, with a
  dev-only `srcDoc` fallback. GraphQL and event payloads hydrate `Artifact.html` from
  object storage when `htmlStorageKey` is present.
- User-content bootstrap and published artifact responses set CSP, Permissions-Policy,
  COOP, Referrer-Policy, cache, and content-type isolation headers.
- The web canvas has focused tests for nonce-bound `_bootstrap` artifact preview URLs and
  published artifact user-content URLs.
- An opt-in browser smoke verifies a real Chrome iframe can load the user-content
  `_bootstrap` shell, receive artifact HTML over `postMessage`, execute it on the
  artifact origin, and reply to the parent with the same nonce-bound protocol.
- Published artifact URLs are served from wildcard user-content hosts only after
  `publishedAt` is set.
- The same browser smoke verifies the published artifact URL serves stored HTML directly
  from the artifact origin and the `_bootstrap` shell does not leak published content.
- Element anchors are selected through `data-el` overlays and stored on design comments.
- Comments can be recorded on artifacts/elements and optionally sent into a new artifact
  iteration.
- Token tweaks create a child artifact version without a model call.
- PDF export renders a real PDF through a bounded headless-Chromium pool, stores it, and
  emits completion/failure events.
- A renderer integration smoke uses a real local Chromium/Chrome binary when available to
  verify artifact HTML produces a non-empty PDF with page metadata.
- Promotion creates a coding session using the selected artifact HTML as the implementation
  brief.

Verified:

- `packages/shared/test/design.test.ts`
- `design-content.test.ts`
- `artifact.test.ts`
- `design-generation.test.ts`
- `design-artifact-serving.test.ts`
- `design-artifact-serving.integration.test.ts` with
  `TRACE_RUN_DESIGN_BOOTSTRAP_BROWSER_SMOKE=1`
- `design-pdf-renderer.integration.test.ts`
- `designCanvasAnchors.test.ts`
- `@trace/server lint`
- `@trace/server build`
- `@trace/web lint`
- `@trace/web build`
- `@trace/gql build`

## App Sessions

Implemented:

- `startSession(kind: app)` rejects linked repos/source sessions/checkpoint restores at
  initial creation, forces cloud hosting, and provisions a cloud runtime immediately.
- App sessions with an initial prompt queue that prompt across starter workspace
  bootstrap and replay it once `workspace_ready` arrives.
- App prompts receive the Open Design appended system prompt through `RunOptions.appendSystemPrompt`.
- App sessions start standalone and lazily create/link a hidden managed repo on the first
  checkpoint push flow.
- Managed repos are marked with `Repo.provider = managed` and hidden from ordinary repo
  lists.
- Managed smart-HTTP runtime auth is wired for Trace-managed remotes.
- Managed repos can graduate to GitHub through an explicit service/API action that
  mirrors the bare repo with `git push --mirror` and flips `Repo.provider` to `github`
  only after the mirror succeeds.
- Archived app managed repos are garbage-collected after the configured retention window,
  and already-collected managed repos reject clone/export credentials.
- The app starter config targets Next.js App Router, Tailwind, shadcn-compatible UI, pnpm,
  and port 3000.
- The generated app starter pins its framework/dependency versions and has a smoke script
  that installs, lints, typechecks, builds, starts the Next.js dev server, fetches the
  rendered page, and exercises the starter API route from the exact emitted files.
- The container bridge detects app process ports and reports them to the server.
- Detected HTTP ports create/enable `SessionEndpoint` rows for live preview.
- A container-bridge process smoke starts a real HTTP app process, detects its preview
  port, proxies a request, and verifies rendered HTML/source stamps.
- An env-gated endpoint-proxy integration smoke starts the generated Next.js starter and
  verifies the Trace endpoint proxy serves the starter page and API route.
- The same endpoint-proxy integration suite verifies a real browser can open the public
  endpoint host and receive app HTML without private-session auth or authoring overlay
  injection.
- Logs, process state, endpoint preview, terminal, checkpoint panel, and publish/share
  controls are exposed through the session application UI.
- Client event reducers upsert app process and endpoint lifecycle events directly into
  Zustand so live preview, running indicators, and publish state do not depend on mutation
  results.
- `publishAppSession` flips the primary enabled endpoint to public and emits an endpoint
  access update event.
- Published public endpoints render through the endpoint proxy without session auth or
  authoring overlay injection.
- Checkpoints are persisted as `GitCheckpoint` rows after managed remote push confirmation.
- First-checkpoint managed repo creation is retry-safe: once the app group is linked to
  the managed repo, a failed bridge delivery is retried against the same repo instead of
  creating duplicate hidden repos.
- Restore by checkpoint provisions from the checkpoint SHA in a fresh session group.
- App checkpoint restore preserves the source `app` session kind even when the UI starts
  the restore without passing `kind`, and provisions the restored runtime without
  requiring a new prompt.
- A container-bridge integration smoke bootstraps the app starter, commits a checkpoint,
  pushes it to a bare managed remote, clones it, and restores a worktree by checkpoint
  SHA.
- App checkpoint captures render the live endpoint with headless Chromium, upload a PNG,
  store capture metadata on `GitCheckpoint`, and show thumbnails in the checkpoint panel.
- Rewritten app checkpoints clear stale capture metadata when no fresh capture is
  available.
- The endpoint authoring overlay posts `data-trace-source` selections and script errors
  from the live preview iframe, and the Applications panel accepts only messages from the
  active preview origin before surfacing source-location context.

Verified:

- `session.test.ts`
- `session-applications.test.ts`
- `organization.test.ts`
- `managed-git.test.ts`
- `managed-git.integration.test.ts`
- `app-checkpoint-capture.test.ts`
- `endpoint-proxy.test.ts`
- `endpoint-proxy.integration.test.ts` with `TRACE_RUN_APP_STARTER_PROXY_SMOKE=1`
  for generated-starter proxy and endpoint-host browser coverage
- `packages/client-core/test/handlers.test.ts`
- `workspace.integration.test.ts`
- `managed-process-manager.test.ts`
- `@trace/container-bridge build`
- `@trace/desktop build`
- `@trace/server lint`
- `@trace/server build`
- `@trace/web lint`
- `@trace/web build`
- `@trace/shared build`
- `@trace/shared smoke:app-starter`

## Remaining Verification Gap

The remaining gap found by this audit is:

- Run a real hosted `design` session end to end: serverless start, LLM artifact
  generation, fan-out directions, anchored comment, token tweak, PDF export, published
  user-content URL, and promotion into a linked coding session.
- Run a real cloud `app` session end to end: prompt, starter boot, port detection, preview
  iframe, terminal in the app workdir, checkpoint, restore from checkpoint, capture
  thumbnail, publish public endpoint, and open the published URL.

These smokes are executable via `pnpm smoke:design-session` and
`pnpm smoke:cloud-app-session` against a configured Trace server with
`TRACE_SMOKE_SERVER_URL`, `TRACE_SMOKE_AUTH_TOKEN`, and `TRACE_SMOKE_ORG_ID`. They are the
final evidence needed before claiming the larger product goal is fully verified as
working design and app flows.

## Audit Fix Applied

During the audit, rewritten app checkpoints were found to be able to retain stale capture
metadata if the replacement capture was unavailable. The service now persists
`captureStatus: "unavailable"` with null capture fields on app checkpoint rewrites, and a
regression test covers that behavior.

During continuation, app sessions with an initial prompt were found to provision and
bootstrap the starter workspace without necessarily preserving that prompt for replay
after `workspace_ready`. `startSession(kind: app)` now queues the initial run until the
workspace is ready, and pending app command replay includes the Open Design app harness
settings in `appendSystemPrompt`.

During the audit continuation, app checkpoint restores were found to inherit the generic
coding default when the UI omitted `kind` from the restore mutation. Checkpoint restores
now infer `app` from the source session group, keep app restores cloud-only, provision
without requiring a prompt, and reject attempts to restore coding checkpoints as app
sessions.

During this audit continuation, design artifact HTML was found to still be persisted
directly in `Artifact.html` instead of the upload/object-storage path described in
`docs/design-session-experience.md`. New artifact writes now store HTML through the
storage adapter using `Artifact.htmlStorageKey`, and published serving, PDF export,
promotion, GraphQL `Artifact.html`, and artifact events hydrate from the stored blob while
falling back to the legacy column for existing rows.

During this continuation, the verification plan's managed-git graduation row was also
found to lack implementation evidence. `graduateManagedRepoToGitHub` now mirrors the
managed bare repo to a GitHub remote before flipping provider state, emits the normal repo
update event, and has regression coverage that a failed mirror leaves the managed repo
unchanged.

During this audit continuation, design artifact promotion was found to be implemented but
not directly covered by a focused service regression. `artifact.test.ts` now verifies that
promotion hydrates stored artifact HTML, starts a deferred coding session linked to the
source design group, and emits `design_artifact_promoted`.

During this continuation, PDF export completion events were found to be emitted but not
rendered as a first-class timeline item. `buildSessionNodes` now maps
`design_export_completed` into a typed design-export node, and the web session renderer
shows completed/failed exports with download metadata.

During this continuation, failed design-generation directions were found to lose their
fan-out identity and disappear from the canvas. Failure events now include the same
generation/direction metadata as started and streamed events, and the canvas renders a
visible failed artifact card with escaped error text so partial fan-out failures are
observable.

During this continuation, design comments were visible in card chrome but not pinned
inside the origin-isolated artifact preview. The canvas now sends comment anchors to the
`_bootstrap` authoring frame, the bootstrap overlay renders element/artifact pins with
safe text insertion, and the browser smoke verifies a rendered preview reports
`pinCount: 1`.

During this continuation, app token tweaks were supported by the service/API but lacked a
visible app-session control. The Applications panel now exposes a token tweak action that
patches `trace.tokens.json` through `patchAppSessionTokens`, with focused coverage for
JSON-object validation before the mutation is sent.

During this continuation, the published design artifact serving route matched the current
HTML content type used by artifact creation, but the route and an older fixture used
independent literals. Published serving and the focused tests now import
`DESIGN_ARTIFACT_CONTENT_TYPE` so publish/share eligibility stays aligned with artifact
creation.

During this continuation, the app endpoint proxy already injected a source-picker overlay
and the starter emitted `data-trace-source` stamps, but the Applications panel was not
consuming the resulting iframe messages. The panel now validates overlay messages against
the active preview origin and displays selected file:line context or app script errors
from the preview frame.

During this continuation, lazy managed-repo creation had happy-path coverage but not the
explicit retry case required by `docs/managed-git-hosting.md`. `session.test.ts` now
proves that if the first checkpoint links the managed repo but bridge delivery fails, the
next checkpoint attempt reuses that repo and does not create a duplicate hidden repo.

During this continuation, design groups already forced the sidebars closed but still
rendered an inactive right-sidebar toggle in the header. The header now receives an
explicit `canShowSidebar` flag and design mode disables that chrome alongside the
applications toggle and tab strip.

During this continuation, design harness settings existed on session creation but clients
had no API to discover valid configured design-system or skill IDs. The server now exposes
`designPromptContentCatalog` from the same `TRACE_DESIGN_CONTENT_DIRS` roots used for
prompt composition, with service coverage for upstream-shaped catalog discovery and
de-duplication across roots.

During this audit continuation, existing design/app sessions could store harness settings
at creation time but had no service/API path to change them later. `updateDesignHarnessSettings`
now updates `designSystemId` and `designSkillIds` through the service layer, rejects
ordinary coding session groups, emits a session-scoped snapshot event, and has focused
session-service coverage.

During this continuation, the design harness content catalog and update mutation existed
but were not visible in the product UI. The design canvas toolbar and app Applications
panel now include a compact settings popover for choosing the design system and skill set,
hydrate existing harness fields through session-group queries, and have focused coverage
for skill toggling and selection summaries.

During this continuation, the verification plan had an executable cloud app smoke but the
design acceptance path was still only manual. `pnpm smoke:design-session` now exercises a
hosted design session across serverless start, artifact generation, fan-out, comments,
token tweaks, PDF export, publish, browser rendering, and promotion into coding.

During this continuation, the hosted smokes were tightened so generated file artifacts are
fetched, not just checked by metadata. The design smoke downloads the exported PDF and
asserts PDF bytes, and the cloud app smoke downloads the checkpoint capture image when
capture verification is required.

During this continuation, the cloud app smoke covered the terminal service through unit
paths but did not verify an app-session terminal in the hosted runtime. The smoke now
creates a terminal over the `/terminal` WebSocket, runs a command in the app workdir, and
asserts the generated `package.json` is present before continuing to preview, publish, and
restore checks.

During this continuation, the design generation service still had an explicit local
placeholder fallback for missing model credentials. That escape hatch is now removed:
model failures always emit `design_generation_failed`, and no service path returns
placeholder HTML as a successful generated design artifact.

During this continuation, app checkpoint capture accepted any non-empty Chromium output
while storing it as `image/png`. Capture rendering now validates the PNG signature before
upload, and the focused capture test rejects corrupt screenshot bytes.

During this continuation, design PDF rendering accepted any non-empty Chromium output
before upload. The renderer now validates the `%PDF-` signature and rejects corrupt output
before `design_export_completed` can report a downloadable PDF.

During this continuation, design artifact public URLs and app endpoint preview URLs
trusted protocol environment variables directly. Both URL builders now accept only
`http` or `https`, falling back to the safe default for invalid config values.

During this continuation, managed-git smart HTTP had user-token coverage but no direct
service test for provisioned runtime tokens. `managed-git.test.ts` now proves runtime
tokens authorize only when their session is bound to the requested managed repo and reject
unbound sessions before spawning git.

During this continuation, app-session prompt composition was covered at the session layer
but not at the Claude Code adapter boundary. The shared adapter test now verifies
`RunOptions.appendSystemPrompt` is passed as `--append-system-prompt` while the user prompt
continues to be delivered over stdin.

During this audit pass, coding-session preservation had positive evidence through the
existing session suite but lacked a direct guard against app harness leakage. The
workspace upgrade regression now proves a normal coding session still replays its queued
prompt with `appendSystemPrompt: undefined`, while app replay keeps the Open Design app
harness.

During this continuation, the Open Design prompt composer had targeted substring tests
but no rebase-review snapshots for the full composed prompts. `packages/shared` now
snapshots one design artifact prompt and one app starter prompt, covering the vendored
composer output plus the Trace overlays for both delivery paths.

During this continuation, app sessions were found to rely on
`RunOptions.appendSystemPrompt`, which only the Claude Code adapter currently maps to a
real CLI option. `SessionService.start` now rejects app sessions that resolve to any
other tool, including unsupported user defaults, so the Open Design app harness cannot be
silently dropped.

During this continuation, the web quick-start helper was also updated to send
`tool: "claude_code"` explicitly for app sessions. This keeps the app launch button from
falling through to a user's non-Claude default tool while preserving coding-session repo
inheritance/deferred runtime behavior and design-session serverless creation.

During this continuation, the checkpoint restore panel was updated to build restore
inputs by session kind. App checkpoint restores now send `kind: "app"`, force cloud
hosting, and pin `tool: "claude_code"` so older or inconsistent app sessions cannot
restore through a tool that drops the app harness; coding checkpoint restores keep their
original tool and hosting behavior.

During this continuation, design artifact promotion was also connected to navigation.
After `promoteDesignArtifactToCodingSession` returns the promoted coding session, the
design canvas now moves the user into that new session instead of leaving them on the
design canvas with only a toast.

During this continuation, app publish/share now gives explicit user feedback after a
successful publish. The Applications panel copies only a public endpoint URL, shows an
`App published` success toast, and includes an Open action for the shared endpoint.

During this continuation, the design user-content browser integration test was found to
import the storage singleton in default S3 mode, which made the local acceptance check
fail before reaching the browser smoke unless S3 credentials were present. The test now
forces local storage before import so it remains runnable in clean local environments,
with browser execution still gated by `TRACE_RUN_DESIGN_BOOTSTRAP_BROWSER_SMOKE=1`.

During this continuation, the opt-in local acceptance checks were run with browser/runtime
coverage: `TRACE_RUN_DESIGN_BOOTSTRAP_BROWSER_SMOKE=1` passed for authoring `_bootstrap`
and published artifact rendering, `TRACE_RUN_APP_STARTER_PROXY_SMOKE=1` passed for the
generated Next.js starter page/API through the endpoint proxy and public browser endpoint,
`@trace/shared smoke:app-starter` passed from generated starter files, and the
container-bridge workspace integration passed managed-git bootstrap/push/clone/restore.

During this continuation, the endpoint-proxy browser smoke was extended to cover the
private app authoring overlay, not just public endpoint serving. The opt-in smoke now
loads a private endpoint through the preview-auth cookie flow, verifies the injected
overlay posts a `data-trace-source` element selection to the parent frame, and verifies
script errors from the app frame are surfaced through the same overlay channel.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to assert the endpoint serving boundary directly: private preview URLs must include the
authoring overlay in browser-rendered DOM, while the published public URL must not include
`data-trace-app-overlay`.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove send-comment-to-agent behavior. After adding a `design_comment_added` event with
`sendToAgent: true`, the smoke now polls for a child artifact whose `parentArtifactId`
matches the commented artifact and verifies that generated iteration HTML before moving
on to token tweak, PDF export, publish, and promotion.

During this continuation, the hosted `pnpm smoke:design-session` script was also tightened
to assert the user-content bootstrap serving boundary after publish. Once the public
artifact URL renders, the smoke fetches that artifact's `/_bootstrap` URL and verifies it
returns the bootstrap shell without leaking the published artifact content.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove token tweaks are deterministic artifact patches. The smoke now verifies the tweaked
child artifact contains the requested CSS variable and records
`source: "patchDesignArtifactTokens"` plus the patched token metadata.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove checkpoint restore uses managed-git durability correctly. After the first
checkpoint links a managed repo, the smoke now verifies restore creates a fresh app
session group and that the restored group is bound to the same managed repo.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove app publish v1 flips the existing primary preview endpoint. The smoke now checks
that `publishAppSession` returns the same endpoint id used for the private preview before
rendering the public URL.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove real design generation records session usage. After the initial fan-out generation,
the smoke now polls the `session(id:)` token counters and requires positive input/output
token totals before continuing.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove generated artifacts came from the LLM/Open Design path. The smoke now checks initial
and fan-out artifact metadata for `generator: "llm"`, the
`trace-open-design-v1` prompt composer marker, and the expected service source.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
assert the user-content isolation headers required by the design serving contract. The
smoke now checks `_bootstrap` and published artifact responses for HTML content type,
cache mode, CSP shape, COOP, Permissions-Policy, Referrer-Policy, and nosniff headers.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove the first checkpoint is reachable through managed-git smart HTTP. After the
first checkpoint links a managed repo, the smoke now creates a short-lived managed-git
credential, runs `git ls-remote` against the Trace remote, and requires the checkpoint SHA
on `refs/heads/main`.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove managed app repos stay hidden from ordinary repository lists. After the first
checkpoint creates the managed repo, the smoke now queries `repos(organizationId:)` and
fails if the app repo, or any repo with `provider: "managed"`, appears in that picker path.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove anchored design comments carry the payload needed by the canvas and iteration
service. The smoke now checks the emitted `design_comment_added` payload for artifact id,
body, `sendToAgent`, and the selected element anchor before polling for the child
iteration artifact.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove app sessions use the adapter path that can receive the Open Design app harness.
The smoke now requests `tool` from `startSession` and requires fresh and restored app
sessions to start with `claude_code`.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove promotion carries the selected artifact into the coding-session brief. After
promotion, the smoke now reads the promoted session's `session_started` event and requires
the custom implementation prompt plus the selected artifact HTML/text to be present.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove the live preview endpoint is the expected private app preview before publish.
The readiness poll now requires a running process bound to a runtime instance, an enabled
endpoint on port 3000, and `accessMode: "private"` before continuing to terminal,
checkpoint, publish, and restore assertions.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove live runtime logs are flowing as structured app-process logs. The readiness poll
now requires at least one stdout/stderr log entry with non-empty data, sequence, and
timestamp for the running app process before continuing.

During this continuation, the hosted `pnpm smoke:cloud-app-session` script was tightened
to prove checkpoint rows contain durable Git metadata, not just an id. The readiness poll
now requires the checkpoint repo id to match the managed repo, valid commit/tree/parent
SHAs, non-empty subject and author, committed timestamp, non-negative file count, and PNG
capture metadata when capture verification is enabled.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove PDF export completion events carry the timeline/share metadata required by the
design docs. The smoke now checks artifact id, session group id, export type, status,
`.pdf` file name, file URL, byte size, and optional positive page count before downloading
the PDF bytes.

During this continuation, the hosted `pnpm smoke:design-session` script was tightened to
prove published artifacts use the wildcard user-content host model. After publish, the
smoke now requires the public URL host to be scoped as `<artifactId>.<domain>`, not the
Trace app host, before rendering the artifact and checking `_bootstrap`.

During this continuation, the design canvas placement model was corrected to match the
documented lineage UX. Root artifacts and fan-out directions now lay out as side-by-side
columns, while child iterations stay in their parent column and stack vertically as a
lineage strip; focused web tests cover sibling variants, nested iterations, and orphaned
parent references.

During this audit pass, the design canvas was found to still lack the documented focus
mode and two-artifact comparative selection behavior. The canvas now supports single
selection, shift/meta/ctrl two-card selection for comparative iteration prompts, a real
focus layout for the selected artifact, and a version strip derived from that artifact's
lineage branch. Focused web tests cover selection semantics, lineage-strip ordering, and
comparative prompt defaults.

During this audit pass, comparative selection was also found to be UI-only: design
iteration accepted only the primary artifact, so the LLM prompt could not receive the
selected comparison artifact HTML required by the docs. `iterateDesignArtifact` now
accepts `comparisonArtifactIds`, validates them against the same design session group,
hydrates stored comparison HTML, and passes comparison artifact metadata/HTML into the
Open Design prompt context. Focused server tests cover the service validation handoff and
the composed LLM prompt content.

During this audit pass, artifact cards still lacked the per-card device frame and preview
zoom controls called out by the canvas spec. Each design artifact preview now has
desktop, tablet, and mobile frame modes plus card-level zoom controls independent of the
overall canvas pan/zoom. Focused web tests cover the stable frame dimensions and preview
zoom bounds.

During this audit pass, the deterministic design-token tweak path still used blocking
browser prompts instead of the Tweaks panel called out by the canvas spec. The canvas now
uses a `DesignTweaksPopover` with CSS-variable/value inputs, client-side token validation,
and the existing service-layer `patchDesignArtifactTokens` mutation. Focused web tests
cover token patch validation.

During this audit pass, app-session token tweaks also still used a raw browser prompt even
though the docs call for app sessions to reuse the same preview/tweaks chrome. The
Applications panel now opens an `AppTokenTweaksPopover` for `trace.tokens.json` patches,
keeps the existing `patchAppSessionTokens` service path, and has focused coverage that
the default patch payload remains valid JSON.

During this audit pass, design promotion still only sent one artifact into the coding
session even though the canvas and docs support selected artifacts as a set. Promotion now
accepts `referenceArtifactIds`, validates them against the same design session, includes
their hydrated HTML in the coding-session brief, records them in
`design_artifact_promoted`, and the canvas passes the secondary selected artifact when
two-card selection is active.

During this audit pass, PDF export still had no page-options contract even though the
docs call for page size and margin fidelity. `exportDesignArtifactPdf` now accepts
`DesignPdfPageOptionsInput`, validates dimensions and margins, passes them into the
bounded Chromium renderer, emits them on export events, and the renderer applies them via
print `@page` CSS. Focused service and renderer tests cover option propagation,
validation, and generated print CSS.

During this audit pass, app sessions still lacked the documented "Open as coding
session" exit path. `openAppSessionAsCodingSession` now validates that the source group is
an app session with a checkpoint-created managed repo, starts a forked coding session on
that repo, and records the app group through `forkedFromSessionGroupId`. The Applications
panel exposes the action, service tests cover both pre-checkpoint validation and managed
repo handoff, and the hosted cloud app smoke now verifies the returned coding session
uses the managed repo and links back to the app group.

During this audit pass, design sessions were still persisted with `hosting: "local"` even
though the design docs require no runtime/hosting. `HostingMode` now includes
`serverless`, design session creation persists that mode, and the hosted design smoke
requires fresh design sessions to report `hosting: "serverless"` while still proving no
repo and no runtime connection are attached.

During this audit pass, authoring preview element selection still emitted only the
`data-el` id and text snippet even though the design docs require bounding-box context for
selected element anchors. The user-content bootstrap now includes a `bounds` object from
`getBoundingClientRect()` with pixel and normalized viewport coordinates, the design
canvas preserves those bounds through anchor normalization/comment payloads, and focused
server/web tests cover the protocol and normalization behavior.

During this audit pass, the app authoring overlay and hosted smoke were still weaker than
the app element-picker contract. The endpoint proxy overlay now includes bounding-box
context on `trace:app:overlay` element-selection messages, the Applications panel parser
preserves that optional geometry, local endpoint-proxy browser coverage asserts
source/text/bounds are posted from a real private preview, and the hosted cloud app smoke
now requires `data-trace-source` stamps in the private preview DOM.

During this audit pass, design generation usage accounting was found to preserve token
counts but ignore reported LLM cost, which meant design sessions could not fully populate
the existing token/cost badge when an LLM adapter supplied cost metadata. `LLMUsage` now
allows optional `costUsd`, `recordDesignUsage` increments `Session.costUsd` alongside
tokens, and focused design-generation coverage verifies the emitted `usage_updated`
event carries the accumulated cost.

During this audit pass, PDF export completion events were found to expose the upload
storage key and download URL but not the spec-facing file identity. Because Trace's
existing upload pipeline uses the storage key as the durable file identifier, completed
PDF export events now include `fileId` alongside `fileKey`, the session node parser
preserves it, and the hosted design smoke requires the identifier before accepting the
export.

During this audit pass, app publish was found to trust an enabled endpoint without
re-validating that its backing app process was still running. `publishAppSession` now
requires the selected endpoint's process to be in `running` state before flipping it
public, preserving the v1 contract that publish/share exposes a live app endpoint rather
than a stale forwarding row.

During this audit pass, app preview URL creation was found to mint signed preview
credentials for disabled endpoints. The proxy still refused those requests later, but the
service contract now fails earlier: `createEndpointPreview` requires an enabled,
non-revoked endpoint before returning the iframe-auth URL used by app preview.

During this audit pass, design artifact user-content responses were found to set COOP but
not COEP even though the serving contract calls for origin isolation on the cookieless
artifact domain. Bootstrap and published artifact responses now include
`Cross-Origin-Embedder-Policy: credentialless`, and the hosted design smoke requires that
header alongside CSP, COOP, permissions, referrer, cache, and nosniff checks.

During this audit pass, user managed-git credentials were found to authorize any org
member for a hidden managed repo. Managed app repos now require both org membership and
visibility of a session group linked to that repo before minting clone/export credentials,
and smart-HTTP user-token auth re-checks the same session-group visibility before serving
git-upload-pack or git-receive-pack.

During this audit pass, the hosted design smoke still exercised only the default PDF
export path and an element anchor without geometry. The smoke now sends explicit
page-size and margin options to `exportDesignArtifactPdf` and asserts they round trip on
the completion event, and it stores/asserts element-anchor bounds on the comment payload.
That keeps the hosted acceptance check aligned with the documented print-fidelity and
selection-anchor contracts.

During this audit pass, the design PDF render pool was found to release a queued task by
resolving its waiter before reserving the slot. A new render could start in that tiny
gap, exceeding the configured concurrency. The pool now reserves queued slots before
resuming waiters, and the renderer unit suite covers serial execution with concurrency
set to one.

During this audit pass, app checkpoint captures still launched Chromium directly for
each checkpoint thumbnail. The capture path now uses its own bounded queue controlled by
`TRACE_APP_CAPTURE_CONCURRENCY` and `TRACE_APP_CAPTURE_QUEUE_SIZE`, and the focused test
suite proves queued captures reserve slots and run serially when concurrency is one.

During this audit pass, design artifact script errors were captured from the
user-content `_bootstrap` frame but only surfaced as local toasts. The canvas now reports
deduplicated preview errors through `reportDesignArtifactError`, and the service layer
emits `design_artifact_error` session events with artifact id, session group id, message,
and optional stack so agents and clients see the same failure signal.

During this audit pass, private app preview URL minting still trusted an enabled
endpoint row without rechecking that the backing process was currently running. The
preview service now requires the endpoint's app/process pair to be `running` before
issuing signed iframe credentials, matching the live-process guard used by app publish.

During this audit pass, first-checkpoint managed repo creation was retry-safe but not
concurrency-safe inside a single service process: two simultaneous first checkpoint
events could both observe a repo-less app group and create duplicate hidden repos. The
checkpoint service now serializes first managed-repo creation by session group and
re-reads the group after waiting, so concurrent checkpoint events reuse the linked repo.

During this audit pass, design generation failures were found to be reported only after
model streaming began. If design-system content loading or prompt composition failed
first, a requested fan-out direction could disappear without a `design_generation_failed`
event. The generator now wraps setup and streaming in the same failure boundary so every
requested direction keeps its generation and direction metadata on failure.

During this audit pass, the design PDF renderer blocked network and scripts but still
left Chromium profile isolation implicit. Each render now passes a fresh
`--user-data-dir` inside the per-render temp directory, so PDF export runs without the
server's default browser profile or any ambient Trace credentials.

During this audit pass, app preview and publish paths were found to re-check that an
endpoint's backing process was running but not that the enabled endpoint still belonged
to that same runtime instance. Both paths now require
`endpoint.currentRuntimeInstanceId` to match the running process `runtimeInstanceId`
before minting a preview credential or publishing the endpoint, preventing stale
forwarding rows from being treated as live app previews.

During this audit pass, PDF page-size and margin options were implemented in the service
and hosted smoke but the design canvas still called `exportDesignArtifactPdf` with only
the artifact id. The canvas now uses a dedicated PDF export popover, validates explicit
page dimensions and margins client-side, and passes `DesignPdfPageOptionsInput` through
the GraphQL mutation so print-fidelity controls are available in the product UI.

During this audit pass, design comments and send-to-agent iteration were service-backed
but still used blocking browser prompt/confirm dialogs in the canvas. The toolbar now
uses a first-class comment popover with body validation, selected-anchor awareness, and a
send-to-agent checkbox while keeping the existing `commentDesignArtifact` service event
path as the source of truth.

During this audit pass, design direction generation and artifact iteration still used
blocking browser prompts even though the canvas is the primary design workflow surface.
Both actions now use a reusable prompt popover with validation; comparative iteration
still pre-fills the selected-artifact merge prompt and passes comparison artifact ids
through the existing GraphQL/service path.

During this audit pass, app preview and publish rejected stale endpoint/runtime bindings
but the endpoint proxy itself still routed any enabled endpoint whose process row was
running. HTTP and WebSocket proxy entrypoints now also require
`endpoint.currentRuntimeInstanceId` to match the running process runtime before forwarding,
so public and private endpoint hosts cannot route through stale forwarding rows.

During this audit pass, design lifecycle events were present in the event stream but
several rendered as blank rows in the existing left chat rail because `SessionMessage`
did not handle their event types. The session timeline now shows system badges for
design artifact creation/updates, comments, generation failures, preview errors, export
requests, and promotion events while keeping PDF export completions as first-class
download rows.

During this audit pass, the Applications panel's manual endpoint forwarding action was
found to request `accessMode: public`, which blurred the documented boundary between
private live preview and explicit publish/share. Manual forwarding now requests private
access; `publishAppSession` remains the only app-session UI action that flips the primary
endpoint public.

During this audit pass, `pnpm --filter @trace/gql build` found the generated GraphQL
client was stale after the PDF export options and private manual forwarding changes. The
generated client now includes `DesignPdfPageOptionsInput` on `exportDesignArtifactPdf`
and `accessMode: private` on `enableSessionEndpointForwarding`, so typed GraphQL
documents match the source queries.

During this audit continuation, design mode hid the visual coding tab strip and sidebars
but still registered coding chrome commands such as close-tab, find-file, and sidebar
toggles through the command palette. Session shell capabilities are now centralized in a
tested helper: design groups suppress coding chrome commands, while cloud app sessions
retain applications and terminal command surfaces and ordinary coding sessions preserve
their existing guards.

During this audit continuation, app process logs were persisted and queryable but did
not emit `session_application_log_appended`, so the Applications panel could only see
new log output after a network refetch. App log writes now emit a session-scoped event
after the durable row exists, client-core stores `SessionApplicationLogEntry` entities
from both org-wide and session-scoped subscriptions, and the Applications panel renders
logs from the shared Zustand entity table while keeping manual refresh for history.

During this audit continuation, `design_generation_completed` was emitted by the LLM
generation service before artifact HTML had been stored and before the `Artifact` row was
created. Completion is now emitted by the artifact/session persistence paths after the
durable artifact exists, includes the persisted `artifactId`, and leaves the low-level
generation service responsible only for started, delta, failure, and usage events.
The hosted design smoke now also validates that initial generation, fan-out variants, and
comment-driven iterations emit completion only after the matching
`design_artifact_created` event.

During this audit continuation, the cloud app smoke required `data-trace-source` stamps
for the initial private preview but not for a restored checkpoint preview. Restored app
previews now use the same browser acceptance gate, so checkpoint restore must preserve
the source-mapped authoring surface as well as the runtime and managed repo binding.

During this audit continuation, the cloud app smoke proved managed-git checkpoint
reachability with `git ls-remote` but did not require the service-layer push event
specified by `managed-git-hosting.md`. It now also polls the repo-scoped
`repo_branch_pushed` event and requires `refs/heads/main` to point at the checkpoint SHA
with the app runtime session id in the payload.

During this audit continuation, the hosted design smoke proved published artifact
rendering but did not explicitly fail if generated artifacts exposed `publishedAt` or
`publicUrl` before the publish mutation. It now asserts initial artifacts, fan-out
variants, comment-driven iterations, and token-tweak versions remain unpublished until
`publishDesignArtifact` runs.

During this audit continuation, the cloud app smoke still used `git ls-remote` as its
only hosted managed-git durability proof. It now also performs a fresh `git clone` from
the credentialed managed remote, requires clone `HEAD` to equal the checkpoint SHA, and
checks the generated app `package.json` exists in the cloned worktree.

During this audit continuation, design comments were derived from scoped session events
in the canvas but the client-core reducer coverage only asserted artifact upserts. The
handler tests now prove `design_comment_added` is retained in the session-scoped event
bucket from both org-wide and full session subscriptions, matching the event-backed
comment/pin model.

During this audit continuation, app process and endpoint lifecycle events updated
Zustand from the org-wide subscription but not from the full session subscription path.
`handleSessionEvent` now upserts `SessionApplicationProcess` and `SessionEndpoint`
payloads as well, so live preview, process state, and publish state remain event-backed
even when the session view receives the canonical scoped event before the org stream.

During this audit continuation, checkpoint reducer coverage proved org-wide
`git_checkpoint` routing but not the full session subscription path used by an open
session view. The handler tests now prove full session `session_output` events update
session and group `gitCheckpoints` for both checkpoint creation and checkpoint rewrite,
keeping the checkpoint panel event-backed when scoped events arrive first.

During this audit continuation, the hosted design smoke counted fan-out directions but
did not require the direction metadata that the canvas uses to explain variants. It now
asserts each generated artifact carries the expected `directionIndex`, `directionCount`,
and a unique non-empty `directionLabel` through the real GraphQL/service/storage path,
and that each completion event preserves the same fan-out identity.

During this audit continuation, the hosted design smoke also proved durable completion
events but not the streaming lifecycle promised by the design-session docs. It now
requires every smoke-generated artifact to have a matching `design_generation_started`
event and at least one `design_generation_delta` event before the durable completion.

During this audit continuation, app port detection had positive bridge coverage and
server-side filtering coverage, but no bridge-side regression that internal/system ports
are suppressed before endpoint registration. The container-bridge process tests now prove
SSH, Docker, database, Open Design daemon, boundary, and out-of-range ports are filtered
while a forwardable app port is reported.
