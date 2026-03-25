# 12 — Branch Tree Panel

## Summary

Build the collapsible tree panel on the left side of the conversation view that shows the full branch hierarchy. Each node represents a branch, showing its label (or first words of the opening turn), turn count, and depth. The current branch is highlighted. This is the primary navigation mechanism for moving between branches.

## What needs to happen

- Create the tree-panel components under `apps/web/src/features/ai-conversations/components/`:
  - Collapsible left panel (default open on desktop, hidden on mobile)
  - Shows the branch tree as a nested list/tree structure
  - Toggle button to collapse/expand the panel
  - Panel width: ~240px, resizable (stretch)
- Create `BranchTreeNode.tsx` in the same feature folder:
  - Takes `branchId` as prop
  - Displays:
    - Branch label, or first ~30 chars of the branch's first turn, or "New branch" if empty
    - Turn count badge
    - Depth indicator (indentation or subtle nesting lines)
  - Highlighted state when this is the active branch
  - Expandable/collapsible if it has child branches
  - Click navigates to that branch (updates `activeBranchId`)
- Build the tree data structure:
  - Start from root branch, recursively render child branches
  - Use the `childBranches` relation from the branch entity
  - Tree should update in real-time when new branches are created (via `branch.created` events)
- Add animation:
  - Smooth expand/collapse of tree nodes (framer-motion)
  - Subtle highlight transition when switching branches
- Handle deep trees:
  - If the tree is very deep (>5 levels), add horizontal scroll or truncate with a "more" indicator
  - Branch depth indicator shows nesting depth visually

## Dependencies

- 10 (Branch Forking Service & Context Assembly)
  <!-- Ticket 10 creates: forkBranch, getBranchAncestors, branch entity relationships -->

## Completion requirements

- [ ] Tree panel renders the full branch hierarchy starting from root
- [ ] Each node shows label/preview, turn count, and correct nesting
- [ ] Active branch is visually highlighted
- [ ] Clicking a node switches to that branch
- [ ] Panel is collapsible (toggle button)
- [ ] New branches appear in the tree in real-time
- [ ] Tree handles 10+ branches at various depths without layout issues
- [ ] Expand/collapse animations are smooth

## How to test

1. Open a conversation with multiple branches — tree panel shows the hierarchy
2. Click a branch node — view switches to that branch, node is highlighted
3. Create a new branch — it appears in the tree immediately
4. Collapse the panel — content area expands to fill the space
5. Verify deep nesting (3+ levels) renders correctly with proper indentation
6. Verify tree updates when a branch is labeled (label appears on the node)
