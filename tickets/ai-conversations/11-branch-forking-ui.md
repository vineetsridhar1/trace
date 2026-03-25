# 11 — Branch Forking UI

## Summary

Add the fork button to turns and the flow for creating a new branch from the UI. When a user hovers over any turn, a "Branch" button appears. Clicking it creates a new branch forking from that turn, switches the view to the new branch, and focuses the input so the user can immediately start typing.

## What needs to happen

- Add a fork/branch button to `TurnItem.tsx`:
  - Appears on hover (desktop) or long-press (mobile) — part of a turn action bar
  - Icon: `GitBranch` from Lucide or similar
  - Tooltip: "Branch from here"
  - Visible on both user and assistant turns
- On click:
  - Call `forkBranch` mutation with the turn's ID
  - Optionally show a small popover for entering a branch label (with "Skip" to create unnamed)
  - Switch the conversation view to the new branch
  - Focus the input box
  - Show a subtle animation indicating the branch was created (e.g., a brief flash or slide transition)
- Update `ConversationView.tsx` to support branch switching:
  - Track `activeBranchId` in the AI Conversations Zustand UI slice and sync it with the route when branch URLs are present
  - When `activeBranchId` changes, hydrate/display the branch timeline for the new branch
  - Update the active conversation/branch scoped subscriptions to the new branch
- When viewing a forked branch:
  - Show the inherited turns from ancestor branches (read-only, slightly dimmed) above the branch's own turns
  - A visual separator between inherited and branch-specific turns ("Branch started here")
  - The input box is at the bottom for the user's first turn
- Add `useForkBranch()` mutation hook to the frontend

## Dependencies

- 10 (Branch Forking Service & Context Assembly)
  <!-- Ticket 10 creates: forkBranch service method, buildContext algorithm, getBranchAncestors -->

## Completion requirements

- [ ] Fork button appears on hover for every turn
- [ ] Clicking fork creates a new branch and switches to it
- [ ] Optional label input on fork (with skip option)
- [ ] New branch view shows inherited turns (dimmed) above the branch separator
- [ ] Input is focused and ready for the user's first turn in the new branch
- [ ] Sending a turn in the new branch works with full inherited context
- [ ] `activeBranchId` is shared through the feature's Zustand UI slice and correctly switches branches
- [ ] Subscription updates when switching branches

## How to test

1. Hover over a turn — fork button appears
2. Click the fork button — new branch is created, view switches to it
3. Verify inherited turns are shown (dimmed) above the "Branch started here" separator
4. Type and send a message — AI responds with knowledge of the inherited context
5. Switch back to the root branch — original turns are intact, forked branch's turns are not shown
6. Fork from an assistant turn — same flow works
