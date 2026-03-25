# 15 — Inline Branch Indicators

## Summary

Add visual indicators directly on turns that have branches forking from them. When a turn has one or more child branches, a small badge shows the count. Clicking the badge opens a popover listing the child branches with their labels and turn counts. Selecting one navigates to that branch. This provides in-context branch discovery without needing the tree panel.

## What needs to happen

- Update `TurnItem.tsx` to show a branch indicator:
  - Display a small `GitBranch` icon + count badge next to turns where `branchCount > 0`
  - Position: right side of the turn, or below the turn content
  - Style: subtle, muted color — should not compete with the turn content
  - Badge shows the count (e.g., "2" if two branches fork from this turn)
- Create `BranchPopover.tsx` under `apps/web/src/features/ai-conversations/components/`:
  - Triggered by clicking the branch indicator badge
  - Lists all child branches forking from this turn
  - Each item shows:
    - Branch label (or auto-label)
    - Turn count
    - Last activity timestamp
    - Creator name (if org-visible)
  - Clicking a branch item navigates to that branch
  - Popover dismisses on selection or click-outside
- Use `useTurnField(turnId, 'branchCount')` for the badge — re-renders only when the count changes
- When a new branch is created from a turn, the badge should appear/update immediately (via event stream)
- Add a subtle animation when the badge count increments

## Dependencies

- 11 (Branch Forking UI)
  <!-- Ticket 11 creates: fork button on turns, branch switching, activeBranchId management -->
- 12 (Branch Tree Panel)
  <!-- Ticket 12 creates: BranchTreeNode component, branch navigation pattern -->
- 14 (Branch Labels)
  <!-- Ticket 14 creates: branch labels / auto-labels used by the indicator popover -->

## Completion requirements

- [ ] Turns with child branches show a branch count badge
- [ ] Turns without branches show no indicator
- [ ] Clicking the badge opens a popover listing child branches
- [ ] Each branch in the popover shows label, turn count, and last activity
- [ ] Selecting a branch navigates to it
- [ ] Badge appears/updates in real-time when a new branch is created
- [ ] Fine-grained re-render: only the affected turn re-renders when branchCount changes

## How to test

1. Fork from a turn — a "1" badge appears on that turn
2. Fork from the same turn again — badge updates to "2"
3. Click the badge — popover shows both branches with labels and turn counts
4. Click a branch in the popover — view switches to that branch
5. Verify turns without branches show no indicator (no "0" badge)
6. In a long conversation, verify only the forked turn re-renders when a new branch is created
