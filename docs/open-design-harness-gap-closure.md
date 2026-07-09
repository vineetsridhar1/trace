# Open Design Harness Gap Closure

This plan completes the Open Design harness integration described in
`open-design-harness-integration.md`. The harness must power both session kinds:
server-side `LLMAdapter` generation for `design`, and app-builder prompt overlays for
`app`.

## Current Status Note

This document records the original harness gap plan. The composer has since been vendored
under `packages/shared/src/design/vendor`, Trace overlays live outside vendor files,
content loading reads `TRACE_DESIGN_CONTENT_DIRS`, design generation uses the composed
prompt through `LLMAdapter`, app sessions receive it through `RunOptions.appendSystemPrompt`,
and both design/app prompt contracts are snapshot-tested. See
`design-app-session-implementation-audit.md` for current evidence and remaining hosted
smoke requirements.

## Target Contract

- Trace vendors the Open Design prompt composer, not the daemon.
- Vendored files remain diffable against the pinned upstream tag.
- Trace-specific rules live in overlay modules.
- Content libraries are deployment assets, not copied wholesale into the repo.
- Design sessions use the composed prompt as direct model `system` input.
- App sessions use the composed app overlay through `RunOptions.appendSystemPrompt`.
- Prompt output is snapshot-tested.

## Gap 1: Vendored Composer

Implementation:

1. Add `packages/shared/src/design/vendor/`.
2. Copy the upstream prompt modules listed in `open-design-harness-integration.md`.
3. Copy only the contract/type subset needed by the composer.
4. Stub media model data for v1.
5. Add:
   - `LICENSE`
   - `NOTICE`
   - `VENDOR.md`
6. Add a local wrapper:
   - `composeOpenDesignPrompt(input)`
   - no Trace-specific behavior inside vendor files.

Verification:

- Typecheck shared package.
- Snapshot test for a minimal prompt.
- Snapshot test for a prompt with design system and skill selections.

## Gap 2: Content Loader

Implementation:

1. Add `TRACE_DESIGN_CONTENT_DIRS`.
2. Implement multi-root loader:
   - read `skills/*/SKILL.md`
   - read `design-systems/*/manifest.json`
   - read `DESIGN.md`
   - read `tokens.css`
   - read component manifests if present
3. Define stable TypeScript types for loaded content.
4. Runtime/server images fetch pinned content at build time into
   `/opt/trace/design-content`.

Verification:

- Unit test: loader reads a fixture skill.
- Unit test: loader reads a fixture design system.
- Unit test: multiple roots merge without losing org overrides.

## Gap 3: Trace Overlays

Design overlay:

- Self-contained HTML only.
- Use `:root` CSS variables.
- Include stable `data-el` ids.
- Include print-ready deck structure when requested.
- Avoid external network unless allowed.
- Include element-selection metadata for comment anchors.

App overlay:

- Build a full-stack app, not a static artifact.
- Use the provided starter.
- Preserve `data-trace-source` stamps.
- Run the dev server.
- Commit meaningful checkpoints.
- Keep app publish/share expectations explicit.

Implementation:

1. Add `packages/shared/src/design/trace-overlay.ts`.
2. Add `composeTraceDesignSystemPrompt(input)`.
3. Add `composeTraceAppSystemPrompt(input)`.
4. Use the same content loader for both.
5. Keep per-kind requirements separate to avoid HTML-artifact instructions leaking into
   app sessions.

Verification:

- Snapshot test: design overlay contains artifact constraints.
- Snapshot test: app overlay contains full-stack app constraints.
- Regression test: app overlay does not tell the agent to output only one HTML file.

## Gap 4: Delivery into Design Sessions

Implementation:

1. `DesignGenerationService` calls:
   - content loader
   - prompt composer
   - `LLMAdapter.stream`
2. Fan-out variants share the same composed prefix.
3. Direction prompts are appended per variant.
4. Usage is summed across variants into session cost/token fields.

Verification:

- Service test: composed prompt reaches the LLM adapter.
- Service test: three fan-out calls create three sibling artifacts.
- Service test: failed one-of-three generation does not fail successful siblings.

## Gap 5: Delivery into App Sessions

Implementation:

1. Replace the original app prompt overlay with the composed Trace app prompt.
2. Keep `RunOptions.appendSystemPrompt` as the delivery mechanism.
3. For unsupported tool adapters:
   - either reject app sessions for that tool,
   - or implement equivalent adapter support before allowing the tool.
4. Pass `designSystemId` and `skillIds` from the session group into the run command.

Verification:

- Adapter test: Claude Code receives `--append-system-prompt`.
- Service test: app session with unsupported adapter fails clearly or receives equivalent
  prompt support.
- Runtime test: first app run sees the app overlay.

## Gap 6: Design System Settings

Implementation:

1. Add `designSystemId` and `skillIds` to `SessionGroup` metadata or first-class columns.
2. Add picker UI.
3. Store choices through service-layer mutation.
4. Include settings in generation and app run commands.

Verification:

- GraphQL/service test: settings update emits event.
- Generation test: selected design system changes composed prompt.
- UI test: picker state survives navigation.
