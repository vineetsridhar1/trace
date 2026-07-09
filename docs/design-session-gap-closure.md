# Design Session Gap Closure

This plan completes the `design` session kind described in
`design-session-experience.md`. The design kind is a serverless project-design canvas:
no runtime, no git, direct `LLMAdapter` generation, artifact cards rendered on an
origin-isolated user-content domain, comments/tweaks/exports/publish, and promotion into
coding sessions.

## Target Product Contract

A complete design session must support:

- Prompt-first creation from any channel or global entrypoint.
- Multiple parallel HTML artifact variants for a brief.
- Progressive rendering while generation streams.
- Artifact lineage: initial variants are siblings; iterations are children.
- Spatial canvas with pan/zoom, selection, lineage expansion, and focus mode.
- Card-level and element-level comments.
- "Send to agent" comments that queue an iteration with anchored context.
- No-model token tweaks that patch CSS variables and create new artifact versions.
- PDF export through a server-owned render pool.
- Public artifact publish/share URL.
- Promotion of selected artifacts into a linked coding session.

## Gap 1: Placeholder HTML Instead of LLM Generation

Current state:

- `startDesignSession`, `createDesignArtifact`, and `iterateDesignArtifact` can create
  placeholder HTML.
- There is no `LLMAdapter` design generation service.
- Generation usage is not recorded on session token/cost fields.

Implementation:

1. Add `DesignGenerationService`.
   - Inputs: `sessionGroupId`, prompt, parent artifact ids, selected element anchors,
     `designSystemId`, `skillIds`, fan-out count.
   - Output: artifact draft events while streaming, final persisted `Artifact` rows.
   - Dependencies: `LLMAdapter`, Open Design composer, artifact storage.

2. Add generation events.
   - `design_generation_started`
   - `design_artifact_delta`
   - `design_artifact_created`
   - `design_generation_failed`

3. Replace placeholder creation.
   - `startDesignSession` should create the session/timeline immediately, then call
     `DesignGenerationService.generateInitialVariants`.
   - `createDesignArtifact` should become a service method for explicit new variants.
   - `iterateDesignArtifact` should pass parent HTML, prompt, token block, comment
     context, and selected anchors into the model.

4. Persist complete artifact versions.
   - Store HTML in the current `Artifact.html` field for v1.
   - Add object-storage-backed `blobKey` later if size pressure appears.
   - Metadata should record `generator`, `model`, `designSystemId`, `skillIds`,
     `directionId`, token usage, and parent context.

Verification:

- Unit test: starting a design session calls the LLM adapter and persists N artifacts.
- Unit test: iterate includes parent artifact HTML and anchor/comment context.
- Unit test: failed generation emits `design_generation_failed` and does not create a
  false artifact.
- Browser test: a new design session shows generated variants without runtime creation.

## Gap 2: No Open Design Harness

Current state:

- App sessions have a hand-written appended system prompt.
- Design sessions do not use the Open Design prompt composer.

Implementation:

1. Complete `open-design-harness-gap-closure.md`.
2. Expose `composeTraceDesignPrompt(input)` from `packages/shared/src/design`.
3. Use the composed prompt as the `system` value for design `LLMAdapter` calls.
4. Add design-kind overlay requirements:
   - self-contained HTML
   - `:root` CSS variables
   - stable `data-el` ids
   - print-ready deck structure when applicable
   - no external network unless allowed by policy

Verification:

- Snapshot test: prompt composer output for a fixed design system and brief.
- Service test: design generation passes composed prompt to the LLM adapter.

## Gap 3: `srcDoc` Preview Instead of User-Content Domain

Current state:

- `DesignCanvas` renders artifact HTML with `iframe srcDoc`.

Implementation:

1. Add config:
   - `TRACE_USER_CONTENT_DOMAIN`
   - `TRACE_USER_CONTENT_PROTOCOL`
   - local fallback that still uses sandboxed `srcDoc` only in development.

2. Add artifact bootstrap route/service.
   - Host-based lookup: `<artifactId>.<TRACE_USER_CONTENT_DOMAIN>`.
   - `/_bootstrap` serves a tiny HTML shell.
   - Shell listens for `postMessage` containing artifact HTML and overlay config.
   - Published root path serves stored HTML directly only when `publishedAt` is set.

3. Add security headers.
   - CSP from a central allowlist.
   - `Permissions-Policy`.
   - COOP/COEP where compatible.
   - No Trace cookies on user-content domain.

4. Update `DesignCanvas`.
   - iframe `src` points at the bootstrap URL.
   - HTML is sent by postMessage after frame ready.
   - Script errors and element selections post messages back to Trace.

Verification:

- Route test: unpublished artifact root URL does not serve artifact bytes.
- Route test: bootstrap URL returns only bootstrap shell.
- Route test: published artifact root serves stored HTML with user-content headers.
- Playwright test: iframe renders artifact through bootstrap and can report script errors.

## Gap 4: Canvas State Bypasses Event Store

Current state:

- `DesignCanvas` queries urql directly and stores artifacts in component state.
- Mutations refetch after completion.

Implementation:

1. Add artifact and design-comment normalization to the Zustand entity store.
2. Extend event handling for:
   - `design_artifact_created`
   - `design_artifact_updated`
   - `design_comment_added`
   - `design_export_requested`
   - `design_export_completed`
   - `design_artifact_promoted`
3. Replace local artifact state with selectors:
   - `useDesignArtifactIds(sessionGroupId)`
   - `useDesignArtifactField(id, field)`
   - `useDesignCommentsForArtifact(artifactId)`
4. Mutations become fire-and-forget; UI changes arrive via events.

Verification:

- Store test: each design event upserts the expected entity.
- Component test: artifact cards render from store selectors.
- Subscription test: a remote artifact event appears without refetch.

## Gap 5: Comments Need Pins, Anchors, and Agent Queueing

Current state:

- `commentDesignArtifact` records a body, optional anchor, and `sendToAgent`.
- The UI only uses a prompt dialog and does not render comments.

Implementation:

1. Define anchor payloads:
   - card anchor: `{ type: "card", x, y }`
   - element anchor: `{ type: "element", dataEl, rect?, label? }`
2. Add overlay picker script in the artifact bootstrap shell.
3. Render pins in the canvas and focus mode.
4. If `sendToAgent` is true, create a queued generation command for that artifact.
5. Include unresolved comments in iteration context.

Verification:

- Service test: `sendToAgent` creates the expected queued generation/event.
- Browser test: selecting an element creates a comment with `dataEl`.
- Browser test: comment pins remain attached to the artifact version.

## Gap 6: PDF Export Is Only Requested

Current state:

- Export emits `design_export_requested`.
- There is no renderer or downloadable PDF.

Implementation:

1. Add `DesignRenderService`.
   - Owns a small headless Chromium pool.
   - Loads artifact content in isolated context.
   - Applies same network/CSP policy as user-content preview.
2. Add upload pipeline integration.
   - Store generated PDF.
   - Emit `design_export_completed` with `uploadKey`, `downloadUrl`, file size, page count,
     artifact id, and session group id.
3. Add failure handling.
   - Emit `design_export_failed` or `design_export_completed` with an explicit failure is not
     acceptable; prefer a separate event type.
4. Add UI state.
   - Show requested/in-progress/completed export states.
   - Download from the upload URL.

Verification:

- Unit test: requested export enqueues render job.
- Integration test: sample artifact renders to a non-empty PDF.
- Event test: completed event includes a valid upload key and no event is emitted before
  storage succeeds.

## Gap 7: Publish Does Not Serve a URL

Current state:

- Publish sets `publishedAt` and metadata.

Implementation:

1. Add artifact public URL fields to the serialized payload.
2. User-content route serves published root HTML.
3. Add unpublish/access-mode later if product requires it.
4. UI copies/opens the public URL.

Verification:

- Route test: unpublished root returns 404.
- Route test: published root returns HTML and strict headers.
- UI test: publish action exposes open/copy affordance.

## Gap 8: Promotion Needs Better Brief Links

Current state:

- Promotion embeds full HTML in the initial coding prompt.

Implementation:

1. Add artifact reference payload to the promoted session event.
2. Store the selected artifact ids on the fork/link metadata.
3. Keep prompt concise: include URL/reference plus summary, not only a giant code block.
4. In coding session UI, show promoted artifact reference panel.

Verification:

- Service test: promoted session links back to artifact/session group.
- UI test: coding session shows the promoted reference and can open the artifact.

