# Design and App Session Verification Plan

This document defines the evidence required before the design/app session goal can be
called complete. It exists to prevent declaring success from scaffolding, narrow unit
tests, or plausible intent.

## Verification Principles

- Verify through current state, not intended behavior.
- Every mutation must be backed by service tests and event assertions.
- Every user-visible workflow must have a browser or runtime check.
- Event payloads must be sufficient for Zustand upserts; no hidden refetch dependency.
- Generated/published artifacts must be externally observable before completion events
  are emitted.
- App sessions must prove a running app, not only a provisioned runtime.

## Design Session Evidence Matrix

| Requirement | Evidence |
|---|---|
| No runtime for design sessions | Service test asserts no `sessionRouter.createRuntime` call and no hosting options. |
| LLM-generated artifacts | Mock `LLMAdapter` stream test plus browser test showing non-placeholder artifact. |
| Parallel variants | Service test proves N sibling artifacts with same prompt event and no parent. |
| Iteration lineage | Service test proves child artifact has `parentArtifactId`. |
| Event-backed canvas | Store test proves design events upsert artifacts/comments; component test avoids mutation-result state. |
| User-content preview | Route test for bootstrap and Playwright iframe render through user-content origin. |
| Comments and pins | Browser test creates element comment and sees persisted pin on same version. |
| Send comment to agent | Service test proves queued generation includes comment and anchor context. |
| Token tweaks | Service test proves patched token preserves unpatched variables and creates new version. |
| PDF export | Integration test produces a non-empty PDF upload and emits `design_export_completed`. |
| Publish/share | Route test proves published URL serves HTML and unpublished URL does not. |
| Promotion | Service/UI test proves coding session links back to selected artifact reference. |

## App Session Evidence Matrix

| Requirement | Evidence |
|---|---|
| Standalone creation | Service test rejects user `repoId`, source session, and restore at creation unless explicitly allowed for restore flow. |
| Cloud-only runtime | Service test rejects local hosting and provisions a cloud environment. |
| Managed git durability | Integration test clones, pushes, kills runtime, reclones, and verifies commits survive. |
| Starter kit | Runtime test proves Next.js/Tailwind/shadcn starter exists and builds. |
| Dev server | Runtime test proves agent or bootstrap starts the dev process. |
| Port detection | Bridge/service test proves detected port creates `SessionEndpoint`. |
| Preview | Playwright test opens app session preview and sees rendered app content. |
| Logs | Service/store test proves logs append via events and render without refetch. |
| Terminal | WebSocket/terminal test proves command execution in app workdir. |
| Checkpoints | Bridge/service test proves commit push creates `GitCheckpoint`. |
| Checkpoint restore | Runtime test restores from checkpoint SHA and app renders prior state. |
| Publish/share | Endpoint proxy test proves public URL renders without private session auth. |
| Graduation | Git test proves managed repo mirrors to GitHub before provider flip. |

## Required Automated Test Layers

Service tests:

- Session kind validation.
- Artifact lifecycle.
- Managed git auth and repo lifecycle.
- Endpoint publish/share.
- Checkpoint persistence and restore.

Bridge tests:

- Managed remote token injection.
- Starter copy/bootstrap.
- Port detection.
- Git checkpoint parsing and push behavior.

Store/UI tests:

- Event reducers for artifacts/comments/exports/endpoints/logs/checkpoints.
- Design canvas selectors.
- App shell tabs and publish state.

Runtime/browser tests:

- Design session generates and renders variants.
- Design publish URL opens.
- PDF export downloads a non-empty file.
- App session starts, preview renders, logs stream, checkpoint restores.

## Manual Acceptance Script

Run this only after automated checks pass:

1. Start a design session with "three dashboard directions for a small CRM".
2. Confirm three artifact cards appear without a cloud runtime.
3. Add a comment to one card and send it to the agent.
4. Apply a token tweak and confirm a new version appears.
5. Export PDF and download/open the file.
6. Publish the artifact and open the public URL in a clean browser profile.
7. Promote the chosen artifact to a coding session and confirm the reference appears.
8. Start an app session with "build a lightweight CRM approval tracker".
9. Confirm the cloud runtime starts and preview renders a full-stack app.
10. Confirm logs and terminal work in the app workdir.
11. Make the agent change UI, commit a checkpoint, and verify it appears.
12. Restore the checkpoint in a new session and confirm the previous app state renders.
13. Publish/share the app endpoint and open the public URL unauthenticated.
14. Stop/delete the runtime, reclone the managed repo, and verify commits remain.

## Completion Gate

The goal is not complete until:

- Every matrix row has passing automated evidence or a documented, accepted manual
  verification artifact.
- No service emits a completion event before the deliverable exists.
- The browser/runtime acceptance script has been run successfully against a fresh app and
  a fresh design session.
- Remaining limitations are explicitly out of scope for v1 and do not contradict the
  target product contract.

