# 36 — Composer Model & Runtime Pickers

## Summary

Make the model chip and the hosting (cloud / local) chip in `SessionInputComposer` tappable, mirroring web's `SessionInputOptions`. Today both are read-only displays because V1 scoped model and bridge changes out (`mobile-plan.md` line 40, 1052). This ticket adds native pickers that dispatch the existing `UPDATE_SESSION_CONFIG_MUTATION` with the same gating and optimistic-update logic web uses, so mobile reaches feature parity for pre-send config.

## What needs to happen

All plumbing already exists in shared code — the work is a native picker UI and wiring:

- GraphQL is exported from `@trace/client-core`: `UPDATE_SESSION_CONFIG_MUTATION`, `AVAILABLE_RUNTIMES_QUERY`.
- Model list lives in `@trace/shared/models.ts`: `getModelsForTool(tool)`, `getDefaultModel(tool)`, `getModelLabel(model)`.
- Mobile uses **urql** on the client side (`@urql/core` + `urql`), same as web — mutations go through `getClient().mutation(...).toPromise()` (see `apps/mobile/src/hooks/useComposerSubmit.ts:56-76` for the pattern).

### Model picker

- Tap on the model chip opens a bottom sheet (`Sheet` primitive from `components/design-system/Sheet.tsx`, `small` detent) listing `getModelsForTool(session.tool)`.
- Current model is checkmarked; tapping another row closes the sheet and fires:
  ```ts
  applyOptimisticPatch("sessions", sessionId, { model: newModel });
  client.mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel }).toPromise();
  ```
  Roll back on error (same pattern as web `SessionInputOptions.tsx:104-119`).
- **Gating:** chip disabled + non-tappable when `agentStatus === 'active'` or any optimistic mutation is in flight. Visually uses the same `opacity: canInteract ? 1 : 0.5` pattern already in the composer.

### Runtime / hosting picker

- Tap on the hosting icon chip opens a bottom sheet listing:
  1. **Cloud** (`CLOUD_RUNTIME_ID`) — always available.
  2. Connected local runtimes from `AVAILABLE_RUNTIMES_QUERY` where `hostingMode === 'local' && connected === true`, keyed by `registeredRepoIds` (disable rows whose runtime doesn't have the channel's repo registered — match web's `lacksRepo` gate).
- Fetch runtimes lazily on sheet open: `client.query(AVAILABLE_RUNTIMES_QUERY, { tool: session.tool, sessionGroupId })`. Cache per-session for the lifetime of the sheet.
- On select: optimistically patch `session.hosting` + `session.connection.runtimeInstanceId / runtimeLabel`, then call:
  ```ts
  client.mutation(UPDATE_SESSION_CONFIG_MUTATION, {
    sessionId,
    hosting: newIsCloud ? "cloud" : undefined, // local infers hosting
    runtimeInstanceId: newIsCloud ? undefined : value,
  });
  ```
  Mirror web's `handleRuntimeChange` at `SessionInputOptions.tsx:121-160` including the full `nextConnection` optimistic payload.
- **Gating:** runtime picker is only rendered while `isNotStarted` (no messages sent yet). After the first send it becomes a read-only indicator, matching web behavior. Disable during any in-flight optimistic patch.

### Shared UI behaviors

- The mode-tint palette defined in ticket 23 already animates on mode change. Model and runtime chip backgrounds should stay on the neutral `alpha(theme.colors.foreground, 0.12)` border — they do not participate in the mode-color interpolation.
- Haptic on open (`haptic.selection()`) and on commit (`haptic.light()`), matching the existing mode-cycle haptic.
- Both sheets use the existing `Sheet` primitive — no new bottom-sheet library. Sheet routes live in `app/(authed)/sheets/` following the pattern from ticket 24's confirm-stop sheet.
- Optional stretch: add a tool picker (claude_code ↔ codex) in the same bottom sheet style, dispatching `UPDATE_SESSION_CONFIG_MUTATION` with `{ tool: newTool, model: getDefaultModel(newTool) }`. Defer if it adds scope; not required for parity with the read-only chips.

## Out of scope

- Cross-device runtime transfer UX (moving a running session between runtimes). V1 semantics: the picker only affects sessions that haven't started yet.
- Runtime onboarding / "connect a new local runtime" flow.
- Tool picker — included only as stretch.

## Dependencies

- [23 — Input Composer](23-session-input-and-queued-messages.md) — composer layout + mode-tint palette.
- [12 — Surface Primitives](12-surface-primitives-glass-sheet.md) — `Sheet` primitive.
- Web reference: `apps/web/src/components/session/SessionInputOptions.tsx` (model + runtime handlers).
- Client-core exports: `UPDATE_SESSION_CONFIG_MUTATION`, `AVAILABLE_RUNTIMES_QUERY` in `packages/client-core/src/mutations/index.ts`.

## Completion requirements

- [ ] Model chip opens sheet, commits new model via `UPDATE_SESSION_CONFIG_MUTATION`, rolls back on error.
- [ ] Hosting chip opens runtime sheet populated from `AVAILABLE_RUNTIMES_QUERY`, commits via `UPDATE_SESSION_CONFIG_MUTATION` with the correct `hosting` / `runtimeInstanceId` semantics.
- [ ] Pickers disabled while `agentStatus === 'active'` or any optimistic patch is pending.
- [ ] Runtime picker hidden (read-only) once the session has sent at least one message.
- [ ] Optimistic patch applied before the mutation; reverts on error.
- [ ] Local runtimes missing the channel's repo are disabled with an explanatory caption.
- [ ] Haptics fire on open + commit.
- [ ] Both picker sheets <200 lines each; handlers extracted into `hooks/useSessionConfigPickers.ts` or similar.

## How to test

1. Not-started session → tap model chip → sheet lists models for the current tool → select a different model → chip updates immediately → server event reconciles.
2. Kill the server before commit → sheet selection rolls back visibly.
3. Not-started session → tap hosting chip → cloud + connected local runtimes appear → pick Cloud → `session.hosting === 'cloud'`, `runtimeInstanceId === null`.
4. Pick a local runtime that registers the channel's repo → commits → session shows `laptopcomputer` icon + the runtime's label.
5. Pick a local runtime that does NOT register the repo → row disabled, row caption explains why.
6. Send a message → runtime chip becomes read-only (picker no longer opens).
7. Active agent → both chips visually disabled, tapping is a no-op.
