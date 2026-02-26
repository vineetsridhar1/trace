# Plan: Ticket Dependencies (Run After)

## Summary

Add the ability for tickets to depend on other tickets. Users can click a dropdown arrow on the Run button, select "Run After...", pick one or more pending/in-progress tickets as dependencies, and the ticket will automatically start when all dependencies complete.

## Design Decisions

- **Auto-run**: Save prompt/model/effort settings at queue time; auto-run when all deps complete
- **Multiple dependencies**: A ticket can depend on multiple tickets (all must complete)
- **UI**: Split button — main "Run" works as before, dropdown arrow reveals "Run After..."
- **Status**: New "Queued" status badge (cyan/teal) while waiting for dependencies

---

## Current State Machine (on main)

```
STATUS_TRANSITIONS = {
  pending:     ['creation', 'in_progress'],
  creation:    ['in_progress', 'pending'],
  in_progress: ['completed', 'needs_input'],
  needs_input: ['in_progress'],
  completed:   ['merged'],
  merged:      [],
}
```

**Updated with `queued`:**

```
STATUS_TRANSITIONS = {
  pending:     ['creation', 'in_progress', 'queued'],  // + queued
  queued:      ['creation', 'in_progress', 'pending'],  // NEW
  creation:    ['in_progress', 'pending'],
  in_progress: ['completed', 'needs_input'],
  needs_input: ['in_progress'],
  completed:   ['merged'],
  merged:      [],
}
```

Existing statuses on main: `pending`, `creation`, `in_progress`, `needs_input`, `completed`, `merged`

---

## Step 1: Database Schema

**File: `server/prisma/schema.prisma`**

Add a `TicketDependency` join table:
```prisma
model TicketDependency {
  id                 String   @id @default(uuid())
  ticketMessageId    String   @map("ticket_message_id")
  dependsOnMessageId String   @map("depends_on_message_id")
  createdAt          DateTime @default(now()) @map("created_at")

  ticket    Message @relation("ticketDeps", fields: [ticketMessageId], references: [id], onDelete: Cascade)
  dependsOn Message @relation("depTarget", fields: [dependsOnMessageId], references: [id], onDelete: Cascade)

  @@unique([ticketMessageId, dependsOnMessageId])
  @@index([dependsOnMessageId])
  @@map("ticket_dependencies")
}
```

Add `queuedRunConfig Json?` field to the `Message` model (stores prompt, model, effort, planMode when queued via "Run After").

Add reverse relations on `Message`:
```prisma
dependencies   TicketDependency[] @relation("ticketDeps")
dependedOnBy   TicketDependency[] @relation("depTarget")
```

Run `prisma migrate dev` to create the migration.

## Step 2: Add "queued" to the Status State Machine

**File: `server/src/schema/message/resolvers/Mutation/updateMessageStatus.ts`**
- Add `'queued'` to `VALID_STATUSES` array
- Add `queued` to `STATUS_TRANSITIONS`:
  - `pending` can transition to `queued` (user clicks "Run After")
  - `queued` can transition to `creation`, `in_progress` (auto-run starts), or `pending` (user cancels)

**File: `server/src/services/ticketService.ts`**
- Add `queued: 'todo'` to `STATUS_TO_SLUG` (queued tickets stay in TODO column)

**File: `src/types.ts`**
- Add `'queued'` to `TicketStatus` union (currently: `'pending' | 'in_progress' | 'completed' | 'creation' | 'merged' | 'needs_input'`)

**File: `src/components/MessageItem.tsx`**
- Add `queued` entry to `STATUS_CONFIG` with cyan styling:
  ```ts
  queued: { label: 'Queued', color: 'text-cyan-400', bgColor: 'bg-cyan-400/10', avatarBg: 'bg-cyan-500/20', avatarText: 'text-cyan-400' }
  ```

**File: `src/components/TicketView.tsx`**
- Add matching `queued` entry to its `STATUS_CONFIG`

## Step 3: GraphQL Schema & Resolvers

**File: `server/src/schema/kanban/schema.graphql`**

Add new types and mutations:
```graphql
type TicketDependency {
  id: ID!
  ticketMessageId: String!
  dependsOnMessageId: String!
  dependsOnTicketTitle: String
  createdAt: DateTime!
}

extend type Mutation {
  setTicketDependencies(
    channelId: ID!
    messageId: ID!
    dependsOnMessageIds: [ID!]!
    runConfig: JSON!
  ): Message!
  removeTicketDependency(
    channelId: ID!
    messageId: ID!
    dependsOnMessageId: ID!
  ): Boolean!
}

extend type Query {
  ticketDependencies(messageId: ID!): [TicketDependency!]!
}
```

**New resolver: `setTicketDependencies`**
1. Delete existing dependencies for this message
2. Create new `TicketDependency` rows
3. Save `queuedRunConfig` JSON on the Message
4. Update message status to "queued" (bypassing state machine check since this is a system transition)
5. Broadcast `message-upsert` SSE

**New resolver: `removeTicketDependency`**
1. Delete the specific dependency row
2. If no deps remain, reset status to "pending" and clear `queuedRunConfig`

**New resolver: `ticketDependencies`**
1. Query dependencies with joined ticket title for display

## Step 4: Server-side Auto-Run Trigger

**File: `server/src/services/ticketService.ts`**

New function `checkAndTriggerDependents(completedMessageId, channelId)`:
1. Find all `TicketDependency` rows where `dependsOnMessageId = completedMessageId`
2. For each dependent ticket's `ticketMessageId`, check if ALL its dependencies have `message.status = 'completed'`
3. If all deps are met, broadcast SSE event `ticket-ready-to-run` with `{ channelId, messageId, runConfig }`

**Hook into completion flow:**
- `server/src/schema/message/resolvers/Mutation/updateMessageStatus.ts` — call `checkAndTriggerDependents` after status transitions to `'completed'`
- The state machine already enforces that only `in_progress` can transition to `completed`, so no guard needed

## Step 5: Frontend Types & SSE

**File: `src/types.ts`**
- `'queued'` added to `TicketStatus` (from Step 2)

**File: `src/hooks/useSse.ts`**
- Add listener for `ticket-ready-to-run` SSE event
- New callback prop: `onTicketReadyToRun: (messageId: string, runConfig: unknown) => void`
- Add `'queued'` to the `onNeedsAttention` reason type (alongside existing `'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input'`)

## Step 6: Auto-Run Handler

**File: `src/hooks/useClaudeMessageActions.ts`**
- Add `autoRunQueuedTicket(messageId, runConfig)` that:
  1. Extracts prompt, model, effort, planMode from runConfig
  2. Gets creation commands via `getCreationCommands()`
  3. Calls `updatePreviewForPendingRun` with the saved prompt
  4. Updates status to `creation` if creation commands exist
  5. Spawns Claude with saved config via `spawnClaudeForMessage`
  6. Status moves to `in_progress` on success

**File: `src/App.tsx`**
- Wire `onTicketReadyToRun` SSE callback to call `autoRunQueuedTicket`

## Step 7: Split Button UI

**File: `src/components/RunButtons.tsx`**

Transform Run button into a split button:
```
[     Run     ][v]
```
- Left: "Run" (existing behavior)
- Right: Dropdown arrow that shows a popover with "Run After..." option
- "Run After..." opens a ticket selector

New props:
- `channelTickets: { messageId: string; title: string; status: string }[]`
- `currentMessageId: string`
- `onRunAfter: (dependsOnMessageIds: string[], runConfig: RunConfig) => void`

**New component: `src/components/TicketDependencySelector.tsx`**
- Popover listing pending & in-progress tickets (excluding current)
- Checkboxes for multi-select
- "Queue" confirm button
- Shows ticket title + status badge per item

## Step 8: Wire Up in ThreadPanel

**File: `src/components/ThreadPanel.tsx`**
- Pass channel tickets and `onRunAfter` handler to `RunButtons`
- `onRunAfter` calls the `setTicketDependencies` GraphQL mutation
- Channel tickets come from the kanban `columns` state (passed via context)

## Step 9: Visual Indicators

**File: `src/components/KanbanCard.tsx`**
- Show a small chain icon (FiLink from react-icons/fi) when ticket has dependencies
- Subtle text: "Queued" or "Waiting on N tickets"

**File: `src/components/TicketView.tsx`**
- Add "Dependencies" section showing what this ticket waits on
- Add "Depended on by" section if other tickets depend on this one

## Step 10: Codegen & Build

- `cd server && npm run codegen` — server resolver types
- `npm run codegen` — client Apollo hooks (uses `useBoardLazyQuery` pattern, not `useApolloClient`)
- Build and verify

---

## Architecture Flow

```
User clicks "Run After" → selects deps → confirms
  → setTicketDependencies mutation
  → Server: creates TicketDependency rows + saves runConfig
  → Server: status transitions pending → queued (state machine)
  → SSE: message-upsert (UI shows "Queued" badge)

Dependency ticket completes (user clicks Delete Worktree)
  → updateMessageStatus("completed")   [in_progress → completed per state machine]
  → Server: checkAndTriggerDependents()
    → All deps met? → SSE: "ticket-ready-to-run" { messageId, runConfig }

  → Frontend SSE listener → autoRunQueuedTicket()
    → status: queued → creation → in_progress (state machine transitions)
    → spawnClaude() with saved config
```

## Key Files

| File | Changes |
|------|---------|
| `server/prisma/schema.prisma` | New `TicketDependency` model, `queuedRunConfig` on Message |
| `server/src/services/ticketService.ts` | `checkAndTriggerDependents()`, STATUS_TO_SLUG |
| `server/src/schema/kanban/schema.graphql` | New types, mutations, queries |
| `server/src/schema/message/resolvers/Mutation/updateMessageStatus.ts` | Add `queued` to state machine, hook dependency check |
| `src/types.ts` | Add `queued` to TicketStatus |
| `src/hooks/useSse.ts` | `ticket-ready-to-run` listener |
| `src/hooks/useClaudeMessageActions.ts` | `autoRunQueuedTicket()` |
| `src/App.tsx` | Wire auto-run handler |
| `src/components/RunButtons.tsx` | Split button UI |
| `src/components/TicketDependencySelector.tsx` | New: ticket selector popover |
| `src/components/ThreadPanel.tsx` | Pass new props |
| `src/components/KanbanCard.tsx` | Dependency indicator |
| `src/components/MessageItem.tsx` | Queued status config |
| `src/components/TicketView.tsx` | Queued status config + dependencies section |
