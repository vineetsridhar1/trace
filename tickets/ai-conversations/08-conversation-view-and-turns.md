# 08 — Conversation View & Turn Rendering

## Summary

Build the main conversation view — the screen where users see turns and interact with the AI. This is a single-branch view for now (no tree panel, no branching UI — those come in Phase B). The view shows the turn list for the root branch, an input box at the bottom, and renders markdown content. This is the "Claude.ai within Trace" baseline.

## What needs to happen

- Create `apps/web/src/components/ai-conversations/ConversationView.tsx`:
  - Top-level component for the `/conversations/:id` route
  - Fetches conversation data and root branch turns on mount
  - Subscribes to `branchTurns` for real-time updates
  - Manages current branch ID in state (defaults to root branch; branching changes this in ticket 11)
- Create `apps/web/src/components/ai-conversations/TurnList.tsx`:
  - Virtualized list of turns for the current branch
  - Auto-scrolls to bottom on new turns (with a "scroll to bottom" button if user has scrolled up)
  - Accepts `branchId` as prop
- Create `apps/web/src/components/ai-conversations/TurnItem.tsx`:
  - Renders a single turn
  - Takes `turnId` as prop, uses `useTurnField` selectors
  - User turns: right-aligned or left-aligned with user avatar/name
  - Assistant turns: left-aligned with AI avatar
  - Content rendered as markdown (use existing markdown renderer or add `react-markdown`)
  - Show timestamp on hover
  - Subtle entrance animation (framer-motion fade-in)
- Create `apps/web/src/components/ai-conversations/TurnInput.tsx`:
  - Text input at bottom of the conversation
  - Multi-line with auto-resize (textarea, not single-line input)
  - Submit on Enter (Shift+Enter for newline)
  - Calls `useSendTurn()` mutation on submit
  - Shows loading state while waiting for AI response
  - Disabled while AI is responding
- Handle the streaming/loading UX:
  - While the AI is generating, show a typing indicator or streaming text
  - The assistant turn appears incrementally if streaming is supported, or all at once with a loading state
- Handle empty conversation state:
  - When the conversation has no turns, show a centered prompt ("Start a conversation..." or similar)
  - Focus the input automatically

## Dependencies

- 06 (Zustand Store & Entity Integration)
  <!-- Ticket 06 creates: Zustand selectors for turns/branches, query/mutation hooks, optimistic updates -->

## Completion requirements

- [ ] Conversation view loads and displays turns for the root branch
- [ ] Turns render with correct role styling (user vs. assistant)
- [ ] Markdown content renders correctly (code blocks, bold, lists, links)
- [ ] Turn list is virtualized and auto-scrolls to bottom
- [ ] Input box supports multi-line, submits on Enter
- [ ] Sending a turn shows optimistic user turn immediately
- [ ] AI response appears when ready (streaming or full)
- [ ] Loading/typing indicator shows while AI is generating
- [ ] Empty conversation shows a helpful prompt and auto-focuses input
- [ ] Real-time subscription updates the turn list when new turns arrive

## How to test

1. Navigate to a conversation — turns load and display
2. Type a message, press Enter — user turn appears immediately, AI response follows
3. Verify markdown renders: send "```js\nconsole.log('hi')\n```" — code block appears
4. Scroll up in a long conversation — "scroll to bottom" button appears
5. Open the same conversation in two tabs — sending a turn in one shows it in the other (subscription)
6. Verify the turn list handles 100+ turns without performance degradation
