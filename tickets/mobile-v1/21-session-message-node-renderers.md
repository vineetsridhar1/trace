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

- [ ] Every SessionNode type from web has a mobile renderer
- [ ] Assistant messages render markdown correctly (headers, lists, code blocks)
- [ ] Streaming cursor animates on active assistant messages
- [ ] Tool call rows collapse/expand correctly
- [ ] Long-press copy works
- [ ] All files <200 lines

## How to test

1. Open a session with a rich event history — verify each renderer visually.
2. Trigger an active assistant stream on web; mobile shows blinking cursor on the in-progress message.
3. Tap a tool call → args expand.
4. Long-press a user message → context menu → Copy → text in clipboard.
5. PR event → card renders → tap → PR URL opens in Safari.
6. Connection lost event → banner appears in-stream; tap Retry → mutation fires.
