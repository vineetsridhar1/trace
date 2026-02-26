# Plan: Update Task Statuses + Worktree Check

## Summary

Add `merged` as a new message status and replace the filesystem-based worktree check with `git worktree list`.

**Final status flow:** `pending` → `creation` → `in_progress` → `completed` → `merged`

---

## Changes

### 1. Add `merged` to TicketStatus type
**File:** `src/types.ts:160`
- Change: `'pending' | 'in_progress' | 'completed' | 'creation'` → `'pending' | 'in_progress' | 'completed' | 'creation' | 'merged'`

### 2. Add `merged` to server VALID_STATUSES
**File:** `server/src/schema/message/resolvers/Mutation/updateMessageStatus.ts:7`
- Add `'merged'` to the VALID_STATUSES array

### 3. Add `merged` to MessageItem STATUS_CONFIG
**File:** `src/components/MessageItem.tsx:8-13`
- Add merged entry with purple styling (matching the kanban column color `#bb9af7`)

### 4. Add `merged` to TicketView STATUS_CONFIG
**File:** `src/components/TicketView.tsx:8-12`
- Add merged entry with purple styling

### 5. Change merge-to-main to set status `merged`
**File:** `src/hooks/useClaudeMessageActions.ts:454`
- Change `statusOnSuccess: 'completed'` → `statusOnSuccess: 'merged'`

### 6. Update SSE completion detection to include `merged`
**File:** `src/hooks/useSse.ts:74`
- The `onNeedsAttention` check currently only fires for `completed`. Update it to also fire for `merged` transitions.

### 7. Update `checkWorktreeExists` to use `git worktree list`
**File:** `src/main/worktree.ts:107-110`
- Replace the `fs.existsSync(worktreePath)` check with spawning `git worktree list` and checking if the worktree path appears in the output
- Need the repo path to run git commands — add it as a parameter or derive from worktreeBase

### 8. Kanban mapping (already done)
**File:** `server/src/services/ticketService.ts:33-39`
- Already has `merged: 'merged'` in STATUS_TO_SLUG — no change needed

---

## Not changing
- Internal value `creation` stays as-is (already displays as "Creating" in UI)
- No database migration needed (status is a free-form String field)
