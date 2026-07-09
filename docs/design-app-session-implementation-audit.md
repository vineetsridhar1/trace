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
