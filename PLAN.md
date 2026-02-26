# Plan: Delete Messages (Soft Delete + Worktree Cleanup)

## Summary
Add the ability to soft-delete messages via a hover trash icon on each message item, with a `window.confirm()` confirmation dialog. Deleting a message hides it from the UI (sets `status = 'deleted'`), deletes the associated worktree if one exists, and broadcasts an SSE event so other clients stay in sync. No Prisma migration needed since we reuse the existing `status` field.

## Changes

### 1. Server: Message Service (`server/src/services/messageService.ts`)
- Add `softDeleteMessage(messageId)` — sets `status = 'deleted'` via Prisma update
- Update `getMessagesByChannel` — add `status: { not: 'deleted' }` filter to exclude soft-deleted messages from the query and count

### 2. Server: GraphQL Schema (`server/src/schema/message/schema.graphql`)
- Add mutation: `deleteMessage(channelId: ID!, messageId: ID!): Boolean!`

### 3. Server: Mutation Resolver (`server/src/schema/message/resolvers/Mutation/deleteMessage.ts`)
- New file following the existing resolver pattern (e.g., `updateMessageStatus.ts`)
- Calls `softDeleteMessage` from the service
- Broadcasts `message-deleted` SSE event with `{ channelId, messageId }`
- Returns `true`

### 4. Client: useMessages Hook (`src/hooks/useMessages.ts`)
- Add `removeMessage(messageId)` — filters the message out of local state

### 5. Client: SSE Handler (`src/hooks/useSse.ts`)
- Listen for `message-deleted` event
- Call `removeMessage` to remove from local state
- Add `removeMessage` to the `UseSseOptions` interface

### 6. Client: MessageItem Component (`src/components/MessageItem.tsx`)
- Add `onDeleteMessage` callback prop
- Add a trash icon (`FiTrash2` from `react-icons/fi`) that appears on hover (positioned at top-right)
- Clicking the trash icon calls `onDeleteMessage(message.id)` (stops event propagation so it doesn't open the thread)

### 7. Client: MessagePanel Component (`src/components/MessagePanel.tsx`)
- Accept new `onDeleteMessage` prop
- Pass it through to each `MessageItem`

### 8. Client: App.tsx
- Add `GQL_DELETE_MESSAGE` mutation (alongside existing `GQL_UPDATE_MESSAGE_STATUS`)
- Add `handleDeleteMessage(messageId)` function that:
  1. Shows `window.confirm("Delete this message? It will be hidden from the list.")`
  2. If the deleted message is currently selected, closes the thread panel
  3. Calls `window.traceAPI.releasePorts(messageId)` and `window.traceAPI.deleteWorktree(messageId, repoPath)` to clean up the worktree
  4. Calls the `deleteMessage` GraphQL mutation
  5. Removes message from local state via `removeMessage`
- Pass `onDeleteMessage={handleDeleteMessage}` through to `MessagePanel`
- Run codegen after server schema change

## File Changes Summary

| File | Change |
|------|--------|
| `server/src/services/messageService.ts` | Add `softDeleteMessage`, filter deleted in `getMessagesByChannel` |
| `server/src/schema/message/schema.graphql` | Add `deleteMessage` mutation |
| `server/src/schema/message/resolvers/Mutation/deleteMessage.ts` | New resolver |
| `src/hooks/useMessages.ts` | Add `removeMessage` |
| `src/hooks/useSse.ts` | Handle `message-deleted` SSE event |
| `src/components/MessageItem.tsx` | Add hover trash icon + `onDeleteMessage` prop |
| `src/components/MessagePanel.tsx` | Pass through `onDeleteMessage` prop |
| `src/App.tsx` | Add delete mutation, `handleDeleteMessage`, wire everything |
| Run codegen | Regenerate types for new mutation |
