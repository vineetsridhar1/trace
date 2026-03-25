# 16 — Quick Switcher

## Summary

Build a keyboard-driven branch switcher overlay, activated by Cmd+B (or Ctrl+B on non-Mac). The overlay shows a searchable list of all branches in the current conversation, with their label, depth, and last activity. Optimized for fast keyboard navigation — users can find and switch to any branch without touching the mouse.

## What needs to happen

- Create `apps/web/src/components/ai-conversations/BranchSwitcher.tsx`:
  - Modal/overlay triggered by Cmd+B (global keyboard shortcut within conversation view)
  - Search input at top, auto-focused on open
  - List of all branches in the conversation below the search
  - Each item shows:
    - Branch label (or auto-label) — highlighted search match
    - Depth indicator (e.g., "depth 2" or nested dots)
    - Turn count
    - Last activity (relative timestamp)
  - Sorted by last activity (most recent first), or by tree depth
- Keyboard navigation:
  - Arrow up/down to select
  - Enter to navigate to the selected branch
  - Escape to close without switching
  - Type to filter — fuzzy search on branch labels
- Styling:
  - Use the same overlay pattern as other command palettes in Trace (if one exists)
  - Or use shadcn `Command` / `CommandDialog` component
  - Backdrop blur/dim behind the overlay
- Register the Cmd+B shortcut:
  - Active only when a conversation is open
  - Does not conflict with other shortcuts
  - Show in any keyboard shortcuts help
- Close the overlay after selecting a branch (auto-close)

## Dependencies

- 12 (Branch Tree Panel)
  <!-- Ticket 12 creates: branch tree rendering, branch navigation pattern -->

## Completion requirements

- [ ] Cmd+B opens the branch switcher overlay
- [ ] All branches in the conversation are listed
- [ ] Search filters branches by label (fuzzy match)
- [ ] Keyboard navigation works (arrows, Enter, Escape)
- [ ] Selecting a branch navigates to it and closes the overlay
- [ ] Overlay is styled consistently with other Trace overlays
- [ ] Works with 20+ branches without performance issues

## How to test

1. Open a conversation with multiple branches, press Cmd+B — overlay opens with all branches
2. Type part of a branch label — list filters to matching branches
3. Use arrow keys to select, press Enter — navigates to that branch, overlay closes
4. Press Escape — overlay closes without switching
5. Verify Cmd+B does nothing outside of a conversation view
6. Test with 20+ branches — list is responsive and scrollable
