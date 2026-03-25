# 07 — Conversations Sidebar & List

## Summary

Add AI Conversations as a top-level navigation item in the Trace sidebar and build the conversations list view. This is the entry point for the feature — users see their conversations, can search/filter them, and navigate into one. The list shows private conversations and org-visible ones, grouped by Recents / Mine / Shared by Org.

## What needs to happen

- Add an "AI Conversations" entry to the main sidebar navigation (alongside Channels, Sessions, Tickets)
  - Use an appropriate icon (e.g., `MessageSquare` or `BrainCircuit` from Lucide)
  - Show an unread/activity indicator if there are conversations with new activity (stretch — can be deferred)
- Create the list components under `apps/web/src/features/ai-conversations/components/`:
  - Keep the container/presentational split from `plan.md` (`ConversationListContainer.tsx` / `ConversationList.tsx`, etc.)
  - Fetch conversations using `useAiConversationsQuery()` from ticket 06
  - Group conversations into sections: **Recents** (last 7 days), **Mine** (private), **Shared** (org-visible)
  - Each list item shows:
    - Title (or "Untitled conversation" placeholder)
    - Last activity timestamp (relative: "2m ago", "yesterday")
    - Branch count badge with tree icon (if conversation has > 1 branch)
  - List is virtualized for performance (use existing virtualization pattern)
- Add search/filter bar at top of list:
  - Text search filters by conversation title
  - Filter by: All / Private / Shared
  - Filter by project (if conversations are linked to projects — stretch)
- Create `ConversationListItem` components in the same feature folder:
  - Takes conversation ID as prop, uses `useAiConversationField` selectors
  - Click navigates to the conversation view
- Add route for the conversations list at `/conversations` (or whatever the routing pattern is)
- Add route for a single conversation at `/conversations/:id`

## Dependencies

- 06 (Zustand Store & Entity Integration)
  <!-- Ticket 06 creates: Zustand entity store for AiConversation, query hooks, selectors -->

## Completion requirements

- [ ] "AI Conversations" appears in the main sidebar navigation
- [ ] Conversations list loads and displays the user's conversations
- [ ] Conversations are grouped by Recents / Mine / Shared
- [ ] Each item shows title, last activity, and branch count
- [ ] Text search filters conversations by title
- [ ] Visibility filter works (All / Private / Shared)
- [ ] List is virtualized
- [ ] Clicking a conversation navigates to `/conversations/:id`
- [ ] Empty state is shown when the user has no conversations

## How to test

1. Navigate to AI Conversations in the sidebar — list view loads
2. Create a conversation (via GraphQL for now) — it appears in the list under "Mine"
3. Search by title — list filters correctly
4. Toggle visibility filter — private and shared conversations filter correctly
5. Click a conversation — navigates to the conversation view route
6. Verify list performance with 50+ conversations — no jank (virtualization working)
