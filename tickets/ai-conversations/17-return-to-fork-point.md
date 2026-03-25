# 17 — Return to Fork Point

## Summary

Add a "Return to fork point" button that appears when viewing any non-root branch. Clicking it navigates to the parent branch and scrolls to the turn the current branch forked from. This makes it easy to re-anchor after exploring a tangent — jump back to exactly where you branched, see the original context, and continue.

## What needs to happen

- Add a "Return to fork point" button to the conversation view header:
  - Only visible when `activeBranch.parentBranchId !== null` (i.e., not on root)
  - Label: "← Return to fork point" or just "← Back to parent"
  - Position: in the header/toolbar area, near the breadcrumb
  - Icon: `ArrowLeft` or `CornerUpLeft` from Lucide
- On click:
  - Switch `activeBranchId` to the parent branch via the AI Conversations Zustand UI slice
  - Scroll the turn list to the fork turn (the turn this branch was created from)
  - Briefly highlight the fork turn (pulse animation or background flash) so the user can see exactly where they branched
- Add scroll-to-turn functionality to `TurnList.tsx`:
  - Read an optional `scrollToTurnId` from the shared AI Conversations UI store
  - When set, scroll the virtualized list to that turn after rendering
  - Clear the scroll target after scrolling
- Handle edge case: if the fork turn is in the middle of a long conversation, the scroll should position the fork turn near the top of the viewport (not at the bottom)
- Add keyboard shortcut: Cmd+↑ or Escape (when input is not focused) to return to fork point

## Dependencies

- 11 (Branch Forking UI)
  <!-- Ticket 11 creates: branch switching, inherited-context view state, and non-root branch navigation -->
- 13 (Breadcrumb Navigation)
  <!-- Ticket 13 creates: BranchBreadcrumb, ancestor chain display, branch switching from breadcrumb -->

## Completion requirements

- [ ] "Return to fork point" button appears on non-root branches
- [ ] Button is hidden on the root branch
- [ ] Clicking navigates to parent branch, scrolled to the fork turn
- [ ] Fork turn is briefly highlighted after scrolling
- [ ] Scroll positions the fork turn near the top of the viewport
- [ ] Keyboard shortcut works as an alternative to clicking
- [ ] Button works correctly at any depth (branch of a branch — returns to immediate parent)

## How to test

1. Fork from turn 5 of a 20-turn root branch — navigate to the new branch
2. Click "Return to fork point" — switches to root branch, scrolled to turn 5
3. Verify turn 5 is highlighted briefly
4. Fork a branch from the forked branch, return to fork point — goes to the intermediate branch (not root)
5. On the root branch — verify the button is not visible
6. Test keyboard shortcut — same behavior as clicking the button
