# 21 — Session Message Node Renderers

## Summary

Replace placeholder node text in the session stream with real renderers for each node type. The node model itself (`SessionNode`, `ReadGlobItem`, `buildSessionNodes`, `HIDDEN_SESSION_PAYLOAD_TYPES`) ships from `@trace/client-core` (extracted from web in ticket 20) — mobile renders against the same model as web, so every `SessionNode.kind` must have a matching renderer. Markdown rendering for assistant content. No file-tree / diff expansion in V1.

## What needs to happen

- `apps/mobile/src/components/session/nodes/` — one file per renderer, each <200 lines:
  - `UserMessageBubble.tsx` — right-aligned bubble, user avatar, text, timestamp on long-press
  - `AssistantMessage.tsx` — left-aligned, markdown-rendered content
  - `ToolCallRow.tsx` — collapsed by default (tool icon + name + preview); tap to expand args
  - `ToolResultRow.tsx` — success/error icon + short result; tap to expand
  - `ReadGlobGroup.tsx` — grouped file-access summary: "Read 12 files" + expandable list of paths; no file-contents view in V1
  - `CommandExecutionRow.tsx` — shell command in mono + exit code badge (green 0 / red non-zero)
  - `CheckpointMarker.tsx` — inline chip "✓ Committed: {subject} ({fileCount} files)"; tap: no-op in V1 (file-tree deferred)
  - `PRCard.tsx` — compact card for `session_pr_opened/merged/closed`; tap → opens URL in browser
  - `ConnectionLostBanner.tsx` — dim banner in stream; inline "Retry" button calls `retrySessionConnection` mutation
- `nodes/index.tsx` — `renderNode(node: SessionNode)` switch that dispatches to the right component. Import `SessionNode` from `@trace/client-core`, not from any web or mobile-local module.
- **Per-session hydration** (carried over from ticket 20): add a `SESSION_DETAIL_QUERY` that loads `queuedMessages` + per-session `gitCheckpoints` and upserts into the entity store on session-screen mount. `CheckpointMarker` reads from `useEntityField("sessions", sessionId, "gitCheckpoints")`. Ideally extract the query into `@trace/client-core` so web's `SessionDetailView` can also consume it.
- **Markdown:** use `react-native-markdown-display` with a custom rulesRenderer matching the theme (headers, lists, inline code, code blocks in monospace dark container). No KaTeX/math in V1. No image rendering in V1.
- **Streaming assistant cursor:** if the node is the most recent `assistant` event and the session is still `active`, render a blinking cursor at the end of the text (opacity 0→1→0 over 800ms via Reanimated, UI thread).
- **Long-press on user/assistant bubble:** native context menu: "Copy".
- **No tool-call argument editing / approval UI here** — that's inline via pending-input bar (next ticket).

## Dependencies

- [20 — Session Stream Shell](20-session-stream-shell-and-virtualization.md)
- Install: `react-native-markdown-display`

## Completion requirements

- [x] Every SessionNode type from web has a mobile renderer (event, command-execution, readglob-group, plan-review, ask-user-question)
- [x] Assistant messages render markdown correctly (headers, lists, code blocks) via `react-native-markdown-display` with a theme-aware `Markdown` wrapper
- [x] Streaming cursor (`StreamingCursor.tsx`, Reanimated UI-thread 800ms blink) animates on the latest assistant text when `agentStatus === "active"`
- [x] Tool call rows collapse/expand correctly; `ToolResultRow` renders inline inside `ToolCallRow` with matching tool_use → tool_result correlation
- [x] Long-press copy works via `react-native-context-menu-view` on `UserMessageBubble` and `AssistantMessage`
- [x] All files <200 lines (largest: `SessionStream.tsx` at 176; `nodes/index.tsx` at 146; `useSessionDetail.ts` at 148)

## How to test

1. Open a session with a rich event history — verify each renderer visually.
2. Trigger an active assistant stream on web; mobile shows blinking cursor on the in-progress message.
3. Tap a tool call → args expand.
4. Long-press a user message → context menu → Copy → text in clipboard.
5. PR event → card renders → tap → PR URL opens in Safari.
6. Connection lost event → banner appears in-stream; tap Retry → mutation fires.

## Implementation notes

- **Dispatcher lives in `nodes/index.tsx`** (`renderNode`) with the session_output block-level dispatch split into `nodes/event-output.tsx` to keep files under 200 lines. The `NodeRenderContext` type (maps of tool results / completed subagent results / checkpoints, plus `sessionActive`) lives in `nodes/render-context.ts` so `event-output.tsx` can import it without a circular dependency on `index.tsx`.
- **Per-session hydration** is implemented via `useSessionDetail` (mobile hook — not yet extracted to `@trace/client-core`, matching ticket 20's follow-up 1). Fetches the full `session(id)` entity plus `queuedMessages` + per-session `gitCheckpoints` on screen mount from `SessionSurface`. Uses a direct `setState` for queued messages to also update the `_queuedMessageIdsBySession` reverse index that `useQueuedMessageIdsForSession` reads.
- **Checkpoint markers** render as a footer row beneath `UserMessageBubble` when the prompt event id matches an entry in the `gitCheckpointsByPromptEventId` map built inside `useSessionNodes`. Tap is a no-op in V1.
- **PR cards** are new surface on mobile (web currently doesn't render `session_pr_*` events). Payload shape: `{ prUrl, sessionGroup: { prUrl, ... } }`. The renderer prefers top-level `prUrl` and falls back to the nested `sessionGroup.prUrl`.
- **Connection-lost banner** renders as `ListFooterComponent` on the stream (not as a `SessionNode` kind), since connection state is on `session.connection.state` rather than an event. The banner appears whenever `connection.state === "disconnected"` and disappears automatically when state flips back.
- **`useNewActivityTracker`** extracted from `SessionStream.tsx` as its own hook so the stream component stays under the 200-line budget; `useSessionNodes` now also returns `completedAgentTools`, `toolResultByUseId`, and `gitCheckpointsByPromptEventId`.
- **Subagent row** handles `tool_use` blocks whose name is `agent` or `task`; non-agent tool calls route to `ToolCallRow`. Child events carrying `parentId` are already filtered out by the shared node builder, so mobile doesn't need its own nesting logic.

## Follow-ups discovered during implementation

1. **`SESSION_DETAIL_QUERY` still lives in mobile.** The ticket suggested extracting it into `@trace/client-core` so web's `SessionDetailView` consumes the same query. Left as a follow-up because web's version also upserts terminal/bridge-related state that mobile doesn't need — unifying requires either splitting the query or teaching both platforms to ignore fields they don't care about.
2. **Image attachments on user prompts are not rendered.** Web's `UserBubble` supports `imageKeys` via an `ImageChip` that fetches a signed URL from `/uploads/url`. Deferred — no attachment picker yet on mobile, so there's nothing to surface in V1.
3. **`ToolCallRow` has no Edit-diff view.** Web renders an inline two-pane diff for `edit` tool calls via `InlineDiffView`; mobile currently falls back to the generic JSON input display. Diff viewer is a larger piece of work and isn't a V1 requirement per the ticket.
4. **Long-press menu on tool rows.** The ticket scopes long-press copy to user/assistant bubbles. Tool call / command / subagent rows are tap-to-expand only — adding a "Copy output" context menu to those is a nice-to-have if product wants it in polish.
5. ~~**Message-row utils are duplicated across web and mobile.**~~ **Resolved.** `formatTime`, `formatCommandLabel`, `truncate`, `serializeUnknown`, `getCommandPrefix`, and `stripPromptWrapping` now live in `packages/client-core/src/session/messages.ts`. Web's `messages/utils.ts` and mobile's `nodes/utils.ts` re-export from client-core; `interactionModes.tsx` imports `stripPromptWrapping` + `PLAN_PREFIX` from client-core and re-exports for existing callers.
6. ~~**Markdown link scheme is unvalidated.**~~ **Resolved.** `Markdown.tsx` now whitelists `http(s)` and `mailto` via an `ALLOWED_LINK_SCHEMES` regex; links with any other scheme return `false` from `onLinkPress` and are not handed to `Linking.openURL`.
