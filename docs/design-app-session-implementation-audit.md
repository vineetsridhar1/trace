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

- Run a real cloud `app` session end to end: prompt, starter boot, port detection, preview
  iframe, checkpoint, restore from checkpoint, capture thumbnail, publish public endpoint,
  and open the published URL.

This smoke is executable via `pnpm smoke:cloud-app-session` against a configured Trace
server with `TRACE_SMOKE_SERVER_URL`, `TRACE_SMOKE_AUTH_TOKEN`, and `TRACE_SMOKE_ORG_ID`.
It is the final evidence needed before claiming the larger product goal is fully verified
as a working application flow.

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
