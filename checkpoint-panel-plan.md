# Plan: Git Checkpoints Panel

## Summary

Move git checkpoints from the History popover into a dedicated panel activated via a "Git" tab in GroupTabStrip. Only one panel (chat/terminal/file/checkpoints) is active at a time. Clicking checkpoint chips in chat opens the panel. The History popover becomes sessions-only.

## New Files

### 1. `apps/web/src/components/session/CheckpointOpenContext.ts`
- React context providing `(checkpointId?: string) => void` callback
- Mirrors the existing `FileOpenContext` pattern exactly
- Used by `GitCheckpointChips` to open the panel from deep in the component tree

### 2. `apps/web/src/components/session/CheckpointPanel.tsx` (~120 lines)
- Full main-content panel showing all checkpoints for the session group
- Props: `sessionGroupId: string`, `highlightCheckpointId?: string | null`
- Reads checkpoints from `useEntityField("sessionGroups", id, "gitCheckpoints")`
- Header with "Git Checkpoints" title + checkpoint count
- Scrollable list of checkpoint rows, each showing:
  - Commit SHA (short, monospace) + subject line
  - Session name + timestamp + files changed count
  - Restore button (reuses existing `handleRestoreCheckpoint` logic from SessionHistory)
- Highlighted checkpoint scrolls into view when `highlightCheckpointId` is set

## Modified Files

### 3. `apps/web/src/components/session/GroupTabStrip.tsx`
- Add new props: `showCheckpoints: boolean`, `onToggleCheckpoints: () => void`, `checkpointCount: number`
- Render a "Git" tab at the end of the tab strip (after file tabs) using `GitCommitHorizontal` icon
- Tab follows the same active/inactive styling pattern as existing tabs
- Shows checkpoint count badge when not active

### 4. `apps/web/src/components/session/SessionGroupDetailView.tsx`
- Add state: `showCheckpoints`, `highlightCheckpointId`
- Wire `CheckpointOpenContext.Provider` around the component tree (like `FileOpenContext.Provider`)
- The context callback sets `showCheckpoints = true`, clears `activeFilePath` and `activeTerminalId`, sets `highlightCheckpointId`
- Update existing handlers (`handleSelectSession`, `handleSelectTerminal`, `handleSelectFile`) to also set `showCheckpoints = false`
- Pass new props to `GroupTabStrip`
- Add `CheckpointPanel` to the content area render chain:
  - `activeFilePath` -> MonacoFileViewer
  - `activeTerminal` -> TerminalInstance
  - `showCheckpoints` -> CheckpointPanel
  - `selectedSession` -> SessionDetailView (default)

### 5. `apps/web/src/components/session/messages/GitCheckpointChips.tsx`
- Import and use `CheckpointOpenContext`
- Make each chip clickable -- on click, call `openCheckpointPanel(checkpoint.id)`

### 6. `apps/web/src/components/session/SessionHistory.tsx`
- Remove the entire "Git" section (divider, heading, checkpoint list, all checkpoint-related code)
- Remove `gitCheckpoints` memo, `handleRestoreCheckpoint`, `restoringCheckpointId` state
- Component becomes a clean sessions-only list

## Implementation Order

1. `CheckpointOpenContext.ts` (trivial context)
2. `CheckpointPanel.tsx` (new panel component)
3. `GroupTabStrip.tsx` (add Git tab)
4. `SessionGroupDetailView.tsx` (wire state, context, panel rendering)
5. `GitCheckpointChips.tsx` (make chips clickable)
6. `SessionHistory.tsx` (remove git section)
