# Mobile Porting Audit

This audit compares the newer web app surfaces against the current mobile app and lists the important features, UI changes, and naming changes that still need to be ported.

## Summary

- Highest priority gaps: session forking, header PR actions, the `Spotlight` naming/primary action, and Antigravity tool support.
- Mobile already has partial support for merged/archived workspaces, PR timeline cards, Pi, linked checkout actions, and linked checkout conflict handling.
- Several web-only workspace panels are larger mobile product decisions: files, branch changes, checkpoints, file command palette, and file-scoped AI input.

## P0: Port Before Feature Parity

### 1. Rename mobile linked-checkout `Sync` surfaces to `Spotlight`

Web now exposes the linked-checkout action as `Spotlight`, while mobile still presents the same core action as `Sync`.

Web source:

- `apps/web/src/components/session/LinkedCheckoutActions.tsx:54` describes spotlighting the session branch in the local checkout.
- `apps/web/src/components/session/LinkedCheckoutActions.tsx:73` uses the primary `Spotlight` button before target selection.
- `apps/web/src/components/session/LinkedCheckoutActions.tsx:159` uses `Spotlight checkout...` accessibility text.
- `apps/web/src/components/session/LinkedCheckoutActions.tsx:166` renders the primary action label as `Spotlight`.

Mobile instances to update:

- `apps/mobile/src/components/sessions/LinkedCheckoutPanelSection.tsx:18` has `Sync failed`.
- `apps/mobile/src/components/sessions/LinkedCheckoutPanelSection.tsx:200` says `Main worktree following...`.
- `apps/mobile/src/components/sessions/LinkedCheckoutPanelSection.tsx:207` says `Sync this workspace into your main worktree.`
- `apps/mobile/src/components/sessions/LinkedCheckoutPanelSection.tsx:266` renders the action label `Sync`.
- `apps/mobile/src/components/sessions/LinkedCheckoutSyncConflictSheet.tsx:56` says `Resolve Sync Conflict`.
- `apps/mobile/src/components/sessions/LinkedCheckoutSyncConflictSheet.tsx:58` says `Sync stopped...`.
- `apps/mobile/src/components/sessions/LinkedCheckoutSyncConflictSheet.tsx:122`, `152`, `172`, and `197` use `... And Sync` button labels.
- `apps/mobile/src/components/connections/ConnectionsRepoSyncActions.tsx:13` has `Sync failed`.
- `apps/mobile/src/components/connections/ConnectionsRepoSyncActions.tsx:58` renders `Sync`.

Porting notes:

- Use `Spotlight` for the user-facing action and primary labels.
- Keep internal GraphQL and hook names as `syncLinkedCheckout` unless doing a broader API rename.
- Decide whether conflict-resolution copy should say `Spotlight conflict` or keep technical `sync` language in secondary explanatory text.

### 2. Add session forking to mobile messages

Web lets a user fork from an assistant message/event and opens a confirmation dialog. Mobile has no matching `FORK_SESSION_MUTATION` usage or message action.

Web source:

- `apps/web/src/components/session/messages/AssistantText.tsx:46` renders the fork button beside copy.
- `apps/web/src/components/session/messages/AssistantText.tsx:51` labels it `Fork session`.
- `apps/web/src/components/session/ForkSessionDialog.tsx:41` calls `FORK_SESSION_MUTATION`.
- `apps/web/src/components/session/ForkSessionDialog.tsx:52` navigates to the forked session.
- `apps/web/src/components/session/SessionGroupDetailView.tsx:711` wires `onForkSession` into session content.
- `packages/client-core/src/mutations/index.ts:12` exports `FORK_SESSION_MUTATION`.

Mobile gap:

- `apps/mobile/src/components/sessions/nodes/AssistantMessage.tsx:10` only renders markdown.
- `apps/mobile/src/components/sessions/nodes/event-output.tsx:43` renders `AssistantMessage` without event id/action props.
- `apps/mobile/src/components/sessions/nodes/copy-menu.ts:6` only defines `Copy`.
- No `FORK_SESSION_MUTATION` usage exists under `apps/mobile`.

Porting notes:

- Thread the source event id from `EventNode`/`renderSessionOutput` into assistant text blocks.
- Add a mobile action affordance, likely a context-menu item or compact icon row, with a confirmation sheet.
- After mutation success, route to `/sessions/{forkedGroupId}/{forkedSessionId}`.

### 3. Add Create PR and Merge PR controls to mobile session header

Web has first-class header actions that send or queue standard prompts to create and merge PRs. Mobile only opens an existing PR.

Web source:

- `apps/web/src/components/session/GitHubActions.tsx:10` defines the Create PR prompt.
- `apps/web/src/components/session/GitHubActions.tsx:12` defines the Merge PR prompt.
- `apps/web/src/components/session/GitHubActions.tsx:61` chooses send vs queue mutation.
- `apps/web/src/components/session/GitHubActions.tsx:87` renders the existing PR link.
- `apps/web/src/components/session/GitHubActions.tsx:101` renders `Merge`.
- `apps/web/src/components/session/GitHubActions.tsx:118` renders `Create PR`.
- `apps/web/src/components/session/GroupHeader.tsx:129` includes `GitHubActions` in the group header.
- `apps/web/src/components/session/SessionHeader.tsx:286` includes `GitHubActions` in the session header.

Mobile gap:

- `apps/mobile/src/components/sessions/SessionGroupHeader.tsx:69` only opens `prUrl`.
- `apps/mobile/src/components/sessions/SessionGroupHeader.tsx:135` adds `Open PR` only when `prUrl` exists.
- Mobile does not expose create/merge prompt actions from the header or overflow menu.

Porting notes:

- Reuse `SEND_SESSION_MESSAGE_MUTATION` and `QUEUE_SESSION_MESSAGE_MUTATION` from `@trace/client-core`.
- Match web's disabled rules: no selected session, no bridge access, deleted worktree, inactive/unready session, or cannot send/queue.
- On mobile, these probably belong in `SessionActionsMenu`, with `Create PR` when no `prUrl` and `Merge PR` when `prUrl` exists.

### 4. Add Antigravity to mobile tool selection and defaults

Web supports Antigravity as a first-class coding tool. Mobile currently normalizes unknown tools to Claude Code and only lists Claude Code, Codex, and Pi.

Web source:

- `apps/web/src/components/session/picker/pickerShared.tsx:4` includes `antigravity` in `ToolOptionValue`.
- `apps/web/src/components/session/picker/pickerShared.tsx:11` lists `Antigravity`.
- `apps/web/src/components/session/picker/pickerShared.tsx:19` renders the Antigravity icon.
- `apps/web/src/components/session/picker/pickerShared.tsx:28` preserves `antigravity` in `normalizeTool`.
- `apps/web/src/components/settings/SessionDefaultsSection.tsx:19` lists Antigravity in session defaults.
- `apps/web/src/components/settings/SessionDefaultsSection.tsx:26` labels Antigravity.
- `apps/web/src/components/session/ToolModelPicker.tsx:81` handles tools with no selectable models, including Antigravity.

Mobile gap:

- `apps/mobile/src/components/sessions/SessionModelPickerSheetContent.tsx:72` only preserves `codex` and `pi`; Antigravity falls back to `claude_code`.
- `apps/mobile/src/components/sessions/session-input-composer/useSessionComposerConfig.ts:128` lists only Claude Code, Codex, and Pi.
- `apps/mobile/src/components/settings/SessionDefaultsSheetContent.tsx:23` lists only Claude Code, Codex, and Pi.
- `apps/mobile/src/components/sessions/session-input-composer/SessionComposerToolLogo.tsx:19` handles Pi, then falls back to Codex/Claude images.

Porting notes:

- Add Antigravity to mobile tool option lists.
- Add a React Native Antigravity logo/icon.
- Handle empty model and effort option lists cleanly, matching web's no-model picker behavior.
- Shared model metadata currently has no Antigravity models or default: `packages/shared/src/models.ts:67`, `96`, and `102`.

## P1: Important UI And Workflow Parity

### 5. Promote mobile linked checkout to a header-level `Spotlight` action

Mobile has linked checkout controls, but they are buried in the title pill panel. Web puts Spotlight in the main header beside PR actions.

Web source:

- `apps/web/src/components/session/GroupHeader.tsx:126` shows the linked-checkout subtitle under the group title.
- `apps/web/src/components/session/GroupHeader.tsx:138` renders `LinkedCheckoutActions` directly in the header.
- `apps/web/src/components/session/useLinkedCheckoutHeaderState.ts:150` builds target options from connected local bridges.
- `apps/web/src/components/session/useLinkedCheckoutHeaderState.ts:172` computes target-selection availability.
- `apps/web/src/components/session/useLinkedCheckoutHeaderState.ts:209` supports linking a local checkout from Trace Desktop.

Mobile current state:

- `apps/mobile/src/components/sessions/SessionGroupTitleMenu.tsx:408` renders linked-checkout controls inside the expanded title panel.
- `apps/mobile/src/hooks/useLinkedCheckout.ts:69` states mobile is minus the folder-pick step and only consumes an existing link.
- `apps/mobile/src/hooks/useLinkedCheckout.ts:237` can trigger the sync/spotlight mutation.

Porting notes:

- Decide whether mobile should get a top-level compact `Spotlight` button when a repo/branch/runtime are available.
- Keep "link local checkout" as a Desktop-only flow unless mobile gets a bridge-specific target picker.

### 6. Port run scripts affordance to mobile

Web exposes channel run scripts from the group header and from connections terminals. Mobile has no matching action.

Web source:

- `apps/web/src/components/session/GroupHeader.tsx:73` reads `useRunScripts`.
- `apps/web/src/components/session/GroupHeader.tsx:140` renders `Run scripts`.
- `apps/web/src/hooks/useRunScripts.ts:29` reads channel `runScripts`.
- `apps/web/src/components/settings/ChannelsSection.tsx:108` configures setup and run scripts.
- `apps/web/src/components/connections/ConnectionsRepoTerminals.tsx:122` renders configured scripts for repo terminals.

Mobile gap:

- No `runScripts` usage exists under `apps/mobile/src`.

Porting notes:

- Add a `Run scripts` action to `SessionActionsMenu` only when scripts exist and the active session can open/use a terminal.
- Reuse channel `runScripts` from hydrated entities or add the needed query fields if missing.

### 7. Port web workspace side panels or define mobile equivalents

Web has a right-side workspace panel with files, checkpoints, and changes, plus file tabs and file-scoped AI input. Mobile currently has session, terminal, and browser panes, but no file/checkpoint/change panels.

Web source:

- `apps/web/src/components/session/SidebarPanel.tsx:10` defines `files`, `git`, and `changes` tabs.
- `apps/web/src/components/session/SidebarPanel.tsx:92` renders `FileExplorer`.
- `apps/web/src/components/session/SidebarPanel.tsx:101` renders `BranchChangesPanel`.
- `apps/web/src/components/session/SidebarPanel.tsx:106` renders `CheckpointPanel`.
- `apps/web/src/components/session/SessionGroupDetailView.tsx:668` renders the tab strip for sessions, terminals, and open files.
- `apps/web/src/components/session/SessionGroupDetailView.tsx:752` renders `FileCommandPalette`.
- `apps/web/src/components/session/SessionGroupContentArea.tsx:109` and `136` render file-scoped AI input.

Mobile gap:

- No `FileExplorer`, `BranchChangesPanel`, `CheckpointPanel`, `FileCommandPalette`, or `FileScopedAiInput` equivalent exists under `apps/mobile/src`.

Porting notes:

- This is larger than a label port. Recommended mobile shape: add `Files`, `Changes`, and `Checkpoints` as title-panel actions or as additional panes alongside `session`, `terminal`, and `browser`.
- If implementing incrementally, start with read-only files and changed-file list before adding diff viewer/editor behavior.

### 8. Port auto-archive merged sessions setting to mobile defaults

Web exposes `autoArchiveMergedSessions`; mobile session defaults do not.

Web source:

- `apps/web/src/components/settings/SessionDefaultsSection.tsx:34` includes `autoArchiveMergedSessions` in the saved patch.
- `apps/web/src/components/settings/SessionDefaultsSection.tsx:60` reads the current setting.
- `apps/web/src/components/settings/SessionDefaultsSection.tsx:113` saves the setting.
- `apps/web/src/components/settings/SessionDefaultsSection.tsx:215` renders the setting.

Mobile gap:

- `apps/mobile/src/components/settings/SessionDefaultsSheetContent.tsx:29` only patches tool/model/reasoning defaults.
- No `autoArchiveMergedSessions` usage exists under `apps/mobile/src`.

Porting notes:

- Add a section to `SessionDefaultsSheetContent`.
- Include `autoArchiveMergedSessions` in the mutation result patch and auth user update.

## P2: Already Partial, Needs Polish

### 9. Align Pi picker UX with web provider grouping

Mobile supports Pi and the Pi login special case, but web's picker groups Pi models by provider.

Web source:

- `packages/shared/src/models.ts:46` defines Pi provider groups.
- `apps/web/src/components/session/ToolModelPicker.tsx:63` moves from tool to provider to model.
- `apps/web/src/components/session/picker/ProviderLayer.tsx` implements the provider layer.

Mobile current state:

- `apps/mobile/src/components/sessions/SessionInputComposer.tsx:361` handles Pi `/login`.
- `apps/mobile/src/components/sessions/SessionModelPickerSheetContent.tsx:172` renders a flat model list.
- `apps/mobile/src/components/sessions/session-input-composer/useSessionComposerConfig.ts:119` uses `getModelsForTool(currentTool)` directly.

Porting notes:

- This is not blocking Pi functionality, but it is a UX mismatch.
- If Antigravity is added, also ensure tools with zero models do not render empty `Model` and `Effort` sections.

### 10. Review GitHub token and GitHub CLI settings parity

Web recently gained GitHub token and GitHub CLI import flows. This is likely Desktop-specific, but should be explicitly decided for mobile settings parity.

Web source:

- `apps/web/src/components/settings/ApiTokensSection.tsx:55` implements API token settings.
- `apps/web/src/components/settings/ApiTokensSection.tsx:116` handles missing desktop import support.
- `apps/web/src/components/settings/ApiTokensSection.tsx:293` renders `Import from GitHub CLI`.
- `apps/web/src/components/settings/SettingsPage.tsx:138` renders the API keys settings tab.

Mobile gap:

- Mobile settings currently expose account, org switcher, and session defaults sheets.
- No API token settings exist under `apps/mobile/src/components/settings`.

Porting notes:

- Do not port GitHub CLI import directly unless mobile has a desktop bridge context.
- Consider a read/write GitHub token sheet if mobile needs to create PRs reliably without desktop.

## Confirmed Already Present On Mobile

- Merged and archived workspace list exists: `apps/mobile/app/(authed)/(tabs)/channels/[id]/merged-archived.tsx:15`.
- Merged/archived channel entry point exists: `apps/mobile/app/(authed)/(tabs)/channels/[id].tsx:94`.
- PR event cards exist: `apps/mobile/src/components/sessions/nodes/index.tsx:319`.
- Mobile linked-checkout conflict resolution exists: `apps/mobile/src/components/sessions/LinkedCheckoutSyncConflictSheet.tsx:20`.
- Pi is partially present: `apps/mobile/src/components/sessions/session-input-composer/useSessionComposerConfig.ts:132` and `apps/mobile/src/components/sessions/SessionInputComposer.tsx:361`.
- Session move is present: `apps/mobile/src/components/sessions/SessionGroupHeader.tsx:128`.

## Suggested Implementation Order

1. Rename mobile `Sync` user-facing labels to `Spotlight`.
2. Add `Create PR` and `Merge PR` actions to `SessionActionsMenu`.
3. Add mobile session forking from assistant messages.
4. Add Antigravity to session picker, composer logo, and session defaults.
5. Add auto-archive merged sessions to mobile session defaults.
6. Decide the mobile IA for files, changes, checkpoints, and file-scoped AI.
7. Add run scripts if mobile terminal workflows should match web.
