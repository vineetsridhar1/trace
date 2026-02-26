# Plan: Clear & Resume Threads

## Summary
Add `/clear` command and thread history to visually separate conversation segments. Each "clear" creates a new thread within the same message, and the next message spawns a fresh Claude process. A history button in the thread header allows switching between threads and fully resuming old conversations.

## Answers to Design Questions
1. **Clear behavior**: Hide and preserve (new thread, old events stay in DB)
2. **Resume mode**: Full resume (can switch back and continue)
3. **Button placement**: Thread panel header
4. **Claude session**: Fresh Claude process (no prior context after `/clear`)

## Key Design Insight
How does `sendThreadMessage` know whether to resume or spawn fresh?
- **If the active thread has events** → resume (pass `resumeSessionId`)
- **If the active thread is empty** (just created by `/clear`) → spawn fresh (no `resumeSessionId`)

This elegantly handles all cases:
- After `/clear`: empty thread → fresh spawn
- Resuming old thread: has events → resume current session
- Normal follow-up message: has events → resume

---

## Changes

### 1. Backend: Add `createThread` mutation

**`server/src/schema/thread/schema.graphql`** — Add:
```graphql
extend type Mutation {
  createThread(channelId: ID!, messageId: ID!): Thread!
}
```

**`server/src/services/messageService.ts`** — Add:
```typescript
export async function createEmptyThread(messageId: string) {
  return prisma.thread.create({ data: { messageId } });
}
```

**`server/src/schema/thread/resolvers/Mutation/createThread.ts`** — New resolver file.

### 2. Backend: Add `threadId` param to `appendPrompt`

**`server/src/schema/message/schema.graphql`** — Add optional `threadId`:
```graphql
appendPrompt(..., threadId: ID): CreateMessagePayload!
```

**`server/src/services/messageService.ts`** — Update `appendPromptToMessageThread`:
- If `threadId` provided → use that thread
- Otherwise → current behavior (first thread or create new)

**`server/src/schema/message/resolvers/Mutation/appendPrompt.ts`** — Pass `threadId` through.

### 3. Frontend: Thread-scoped event loading in `useThread.ts`

Add `GQL_THREAD_EVENTS` query (the `threadEvents` query already exists on the server).

Change `loadThreadEvents` to:
1. Fetch threads list → populate `threads` state
2. Load events from the **latest thread only** (via `threadEvents` query, not `messageEvents`)

Change `loadOlderEvents` to use `threadEvents` with the active thread ID.

### 4. Frontend: Thread list, switching, and clearing in `useThread.ts`

New state:
- `threads: Thread[]` — all threads for the current message

New functions:
- `clearThread()` — calls `createThread` mutation, sets new empty thread as active, clears events
- `switchThread(threadId)` — loads events for a specific thread via `threadEvents` query

### 5. Frontend: Add `/clear` command

**`src/hooks/useSlashCommands.ts`** — Add to commands list.

**`src/components/ThreadInput.tsx`** — Intercept `/clear` in `handleSendThreadMessage`:
- If input starts with `/clear`, call `clearThread()` instead of sending to Claude
- Clear the input

### 6. Frontend: Update `ThreadContext.tsx`

Expose: `threads`, `clearThread`, `switchThread`.

### 7. Frontend: Conditional resume in `sendThreadMessage`

**`src/hooks/useClaudeMessageActions.ts`**:
- `sendThreadMessage` checks if the active thread has events
  - Has events → pass `resumeSessionId` (resume)
  - Empty thread → don't pass `resumeSessionId` (fresh spawn), include system instructions
- Pass `activeThreadId` as `threadId` to `persistPrompt` so events go to the correct thread

### 8. Frontend: SSE filtering by active thread

**`src/hooks/useSse.ts`**:
- Only call `appendThreadEvent` if `event.threadId` matches the active thread
- Pass `activeThreadIdRef` into `useSse`

### 9. Frontend: Thread History UI

**`src/components/ThreadHeader.tsx`** — Add `FiClock` history icon button (visible when `threads.length > 1`).

**`src/components/ThreadHistoryDropdown.tsx`** (new file):
- Dropdown anchored to the history button
- Lists threads: index number, creation time, event count
- Highlights active thread
- Click to switch via `switchThread()`

### 10. Plan approval — no change needed

The current "Approve (clear context)" already creates a new thread and spawns a fresh Claude process. This matches the user's desired behavior. No modifications needed.

---

## File Changes Summary

| File | Change |
|------|--------|
| `server/src/schema/thread/schema.graphql` | Add `createThread` mutation |
| `server/src/schema/thread/resolvers/Mutation/createThread.ts` | New resolver |
| `server/src/services/messageService.ts` | Add `createEmptyThread`, update `appendPromptToMessageThread` for `threadId` |
| `server/src/schema/message/schema.graphql` | Add `threadId` to `appendPrompt` |
| `server/src/schema/message/resolvers/Mutation/appendPrompt.ts` | Pass `threadId` |
| `src/hooks/useThread.ts` | Thread list state, `switchThread`, `clearThread`, thread-scoped loading |
| `src/hooks/useSlashCommands.ts` | Add `/clear` command |
| `src/hooks/useClaudeMessageActions.ts` | Conditional resume, pass `threadId` to `persistPrompt` |
| `src/context/ThreadContext.tsx` | Expose new thread state/functions |
| `src/components/ThreadInput.tsx` | Intercept `/clear` |
| `src/components/ThreadHeader.tsx` | Add history button |
| `src/components/ThreadHistoryDropdown.tsx` | New component |
| `src/hooks/useSse.ts` | Filter events by active thread |
| Run codegen for server + frontend | Regenerate types |
