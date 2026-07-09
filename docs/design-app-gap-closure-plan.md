# Design and App Session Gap Closure Plan

Status: historical implementation plan with current status notes. This document turns the target experience in
`design-session-experience.md`, `open-design-harness-integration.md`, and
`managed-git-hosting.md` into an executable checklist. It is intentionally scoped to the
ultimate goal: serverless design canvases with artifact variants/comments/tweaks/PDF/
publish/promotion, and standalone cloud-run app builders with managed git durability,
preview, logs, terminal, checkpoints, publish/share, and verified working output.

## Current Status Note

Most implementation gaps in this original plan have since been closed. The authoritative
current-state audit is `design-app-session-implementation-audit.md`; the remaining
completion gate is hosted end-to-end verification via `pnpm smoke:design-session` and
`pnpm smoke:cloud-app-session` against a configured Trace server.

## Current Implementation Baseline

Implemented foundations:

- `SessionGroup.kind` supports `coding`, `design`, and `app`.
- Design sessions are standalone and do not provision runtimes.
- Design artifact generation uses the LLM-backed design generation service and the
  vendored Open Design prompt composer.
- Design artifacts have lineage through `parentArtifactId`.
- Artifact create/iterate/tweak/publish/promote mutations exist.
- Design comments emit `design_comment_added`.
- Token tweaks create a new artifact version and preserve unpatched CSS variables.
- PDF export renders through the server-owned headless Chromium renderer and emits
  `design_export_completed` only after a valid PDF is available.
- Artifact previews use the user-content bootstrap route when configured, and published
  artifact URLs serve stored HTML only after publish.
- App sessions are cloud-only and reject user-linked repos at creation.
- App sessions lazily create/link a hidden managed repo on first checkpoint, and the
  provisioned bridge can inject `TRACE_RUNTIME_TOKEN` for Trace-managed git remotes.
- Managed repo rows are hidden from ordinary repo list and organization hydration paths.
- `RunOptions.appendSystemPrompt` reaches Claude Code through `--append-system-prompt`.

Remaining verification gap:

- Run `pnpm smoke:design-session` and `pnpm smoke:cloud-app-session` against a configured
  hosted Trace server with `TRACE_SMOKE_SERVER_URL`, `TRACE_SMOKE_AUTH_TOKEN`, and
  `TRACE_SMOKE_ORG_ID`. Local unit/integration coverage is not enough to claim the full
  product goal complete.

## Completion Definition

The goal is complete only when all of these are true:

- Starting a `design` session from the UI produces multiple model-generated HTML artifact
  variants without provisioning any runtime.
- The design canvas renders artifact cards through the user-content bootstrap domain and
  receives progressive artifact updates from events.
- Users can comment on artifacts/elements, send comments to the agent, tweak CSS tokens
  without model calls, publish a public artifact URL, export a real PDF, and promote a
  selected artifact into a coding session.
- Starting an `app` session provisions a cloud runtime, prepares a managed git-backed
  full-stack starter, starts the dev server, auto-detects the app endpoint, and shows
  preview/logs/terminal/checkpoints in the UI.
- App checkpoints push to Trace managed git, survive runtime loss, restore by checkpoint,
  and can be shared/published.
- The implemented paths are covered by service tests, bridge tests, UI/store tests, and at
  least one browser/runtime verification that proves a generated app renders.

## Workstream Order

1. **Harness and design generation**
   - Vendor and test the Open Design composer.
   - Add server-side design generation through `LLMAdapter`.
   - Replace placeholder HTML in design sessions with streamed artifacts.

2. **User-content rendering and publish**
   - Add artifact bootstrap serving.
   - Move design iframe preview from `srcDoc` to postMessage bootstrap.
   - Add public artifact serving for published artifacts.

3. **Design canvas product behavior**
   - Move artifacts/comments to event-backed Zustand state.
   - Add variant fan-out, lineage views, comment pins, element anchors, focus mode, and
     send-comment-to-agent generation.

4. **PDF render pool**
   - Add server-owned headless Chromium worker.
   - Store rendered PDF through the upload pipeline.
   - Emit `design_export_completed` only after the PDF exists.

5. **Managed git and app runtime**
   - Harden smart-HTTP managed git and runtime auth.
   - Ensure app workspaces clone managed repos and push checkpoints.
   - Add first-run full-stack starter and app-oriented prompt overlay.

6. **App shell and distribution**
   - Build preview/logs/terminal/checkpoint UI around app sessions.
   - Add endpoint publish/share.
   - Add checkpoint captures and restore flow.

7. **End-to-end verification**
   - Run a design session and app session through browser/runtime checks.
   - Verify all events, artifacts, endpoints, and managed git objects with durable
     current-state evidence.

## Cross-Cutting Requirements

- Keep GraphQL resolvers thin; all mutation behavior belongs in services.
- Every state change emits an event through the service layer.
- Do not update frontend state from mutation results; event payloads must be sufficient to
  upsert entities into Zustand.
- Keep vendor-specific code inside adapters or explicit integration seams.
- Keep managed repos hidden from user-facing repo pickers except explicit graduation
  flows.
- Treat generated artifact HTML as untrusted content at all times.
- Add tests at the service boundary first, then UI/runtime tests for product flows.
