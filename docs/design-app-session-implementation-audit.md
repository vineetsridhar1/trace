# Design and App Session Implementation Audit

Date: 2026-07-09

This audit compares the current implementation against `docs/design-session-experience.md`,
`docs/open-design-harness-integration.md`, and `docs/managed-git-hosting.md`.

## Current Status

The main server/service/UI paths for `design` and `app` sessions are implemented and
covered by focused tests. The remaining risk is runtime/browser smoke coverage: the code
paths compile and service tests pass, but this audit did not run a live cloud app session
through a browser from prompt to published URL.

## Design Sessions

Implemented:

- `startSession(kind: design)` creates a serverless design group without runtime
  provisioning.
- Initial and fan-out artifact generation call the LLM-backed design generation service.
- Artifacts preserve lineage through `parentArtifactId` and event payloads include full
  artifact data.
- The design canvas uses the existing session/chat shell, renders artifact variants on a
  pan/zoom canvas, and supports focus/fit/zoom controls.
- Artifact previews use the user-content `_bootstrap` iframe flow when configured, with a
  dev-only `srcDoc` fallback.
- The web canvas has focused tests for nonce-bound `_bootstrap` artifact preview URLs and
  published artifact user-content URLs.
- Published artifact URLs are served from wildcard user-content hosts only after
  `publishedAt` is set.
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

- `artifact.test.ts`
- `design-generation.test.ts`
- `design-artifact-serving.test.ts`
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
- The app starter config targets Next.js App Router, Tailwind, shadcn-compatible UI, pnpm,
  and port 3000.
- The generated app starter pins its framework/dependency versions and has a smoke script
  that installs, lints, typechecks, and builds the exact emitted files.
- The container bridge detects app process ports and reports them to the server.
- Detected HTTP ports create/enable `SessionEndpoint` rows for live preview.
- A container-bridge process smoke starts a real HTTP app process, detects its preview
  port, proxies a request, and verifies rendered HTML/source stamps.
- Logs, process state, endpoint preview, terminal, checkpoint panel, and publish/share
  controls are exposed through the session application UI.
- `publishAppSession` flips the primary enabled endpoint to public and emits an endpoint
  access update event.
- Published public endpoints render through the endpoint proxy without session auth or
  authoring overlay injection.
- Checkpoints are persisted as `GitCheckpoint` rows after managed remote push confirmation.
- Restore by checkpoint provisions from the checkpoint SHA in a fresh session group.
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
- `app-checkpoint-capture.test.ts`
- `endpoint-proxy.test.ts`
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

No code-level acceptance gap was found in this audit, but one product-level smoke remains
unproven in this environment:

- Run a real cloud `app` session end to end: prompt, starter boot, port detection, preview
  iframe, checkpoint, restore from checkpoint, capture thumbnail, publish public endpoint,
  and open the published URL.

This smoke is the final evidence needed before claiming the larger product goal is fully
verified as a working application flow.

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
