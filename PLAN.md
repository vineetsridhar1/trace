# Trace App Performance Refactoring Plan

## Problem
The app feels laggy primarily due to:
1. **Synchronous IPC call** (`sendSync`) blocking the renderer thread on every `getServerUrl()` call
2. **Monolithic ThreadContext** with 30+ useMemo deps — every SSE event (2-10/sec during Claude runs) re-renders the entire thread UI tree
3. **641-line useThread.ts** mixing 18 useState calls across unrelated concerns
4. **769-line App.tsx** orchestrating all hooks and building all context values inline
5. **497-line ThreadEvent.tsx** with 9 unmemoized inline sub-components — all re-render on every event
6. **5-second git diff polling** running even when the panel isn't visible
7. **DevTools always open** in production builds

---

## Phase 1: Electron Performance Quick Wins

### 1A. Cache `getServerUrl` in `src/types.ts`
- Cache the result of `sendSync('get-server-url')` on first call (URL never changes after startup)
- Eliminates repeated synchronous IPC blocking the renderer thread

### 1B. Conditional DevTools in `src/main.ts`
- Only open DevTools when `MAIN_WINDOW_VITE_DEV_SERVER_URL` is set (dev mode)

### 1C. Smart worktree diff polling in `src/hooks/useWorktreeChanges.ts`
- Add `enabled` parameter, skip polling when WorktreeChanges panel isn't visible
- Increase `POLL_INTERVAL` from 5000ms to 10000ms

---

## Phase 2: Split `useThread.ts` Into Composable Hooks

### 2A. Extract `src/hooks/useTokenTracking.ts` (~90 lines)
- State: `tokenUsage`, `latestContextTokens`, `cliCostUsd`, `lastSeenUsageRef`, `runAccumulatedRef`
- Expose: `trackEventTokens(event)`, `trackEventTokenUpdate(event)`, `resetTokenTracking()`, `applyLoadedTokenData(data)`

### 2B. Extract `src/hooks/useWorktreeState.ts` (~80 lines)
- State: `hasWorktree`, `deletingWorktree`, `mergingWorktree`
- Functions: `checkWorktree`, `deleteWorktree`, `mergeWorktree`

### 2C. Extract `src/hooks/useThreadSelection.ts` (~30 lines)
- State: `selectedMessageId`, `selectedMessage`, refs
- Function: `syncSelectedMessage`

### 2D. Refactor `src/hooks/useThread.ts` as composer (~300 lines, from 641)
- Compose the above hooks. Return type stays identical — no consumers change.

---

## Phase 3: Split ThreadContext + Self-Contained Providers

### 3A. Create `src/context/ThreadEventsContext.tsx`
New context for high-frequency data (changes on every SSE event):
- `threadEvents`, `threadNodes`, `threadStatus`, `hasMoreEvents`, `loadingOlderEvents`
- Scroll: `threadContentRef`, `showJumpToLatest`, `scrollToLatest`, `onThreadScroll`
- Tokens: `tokenUsage`, `latestContextTokens`, `cliCostUsd`

### 3B. Slim down `src/context/ThreadContext.tsx`
Remove fields moved to ThreadEventsContext. Keep session-level data only.

### 3C. Make `ThreadProvider` self-contained
Calls useThread + useMessages + useThreadScroll internally. Provides both contexts.

### 3D. Make `ClaudeActionsProvider` self-contained
Calls useClaudeMessageActions internally.

### 3E. Slim down `src/App.tsx` (target ~350 lines, from 769)
Remove hook calls and context value building that moved into providers.

---

## Phase 4: Extract and Memoize ThreadEvent Sub-Components

### 4A. Create `src/components/thread-events/` with separate files:
- `ExpandableText.tsx`, `UserPromptBubble.tsx`, `BashToolRow.tsx`, `GenericToolRow.tsx`
- `WriteCodePreview.tsx`, `TodoListPreview.tsx`, `StopBubble.tsx`, `GenericEventRow.tsx`, `ToolUseRow.tsx`

### 4B. Slim `src/components/ThreadEvent.tsx` to ~30-line memoized dispatcher

### 4C. Add `React.memo` to ThreadEvent, sub-components, and ThreadHeader

---

## Phase 5: ThreadPanel + ThreadHeader Context Consumption

### 5A. ThreadPanel consumes split contexts instead of one mega-context
### 5B. ThreadHeader reads from context (replaces 16 props)
