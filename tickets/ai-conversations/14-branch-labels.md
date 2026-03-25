# 14 — Branch Labels

## Summary

Allow users to name and rename branches. Branches are unnamed by default — they get an auto-label derived from the first few words of their opening turn. Users can set a custom label at branch creation time or edit it later. Labels appear in the tree panel, breadcrumb, and branch indicators.

## What needs to happen

- Add `labelBranch` mutation and service method:
  - `labelBranch({ branchId, label, userId })`:
    - Validate user has access and is the conversation creator (or branch creator)
    - Update the branch's `label` field
    - Emit `branch.labeled` event
  - Add to GraphQL schema: `labelBranch(branchId: ID!, label: String!): Branch!`
- Add auto-labeling logic:
  - When a branch's first turn is created and the branch has no label, generate an auto-label
  - Auto-label = first ~30 characters of the first user turn, truncated at a word boundary + "..."
  - Store as a computed display label, not the `label` field (so user-set labels take priority)
  - The display function: `branch.label ?? autoLabel(branch.firstTurn) ?? "New branch"`
- Add inline label editing:
  - In the branch tree panel, double-click a branch node to edit its label inline
  - In the breadcrumb, double-click a crumb to edit the label
  - Input field with Enter to save, Escape to cancel
  - Auto-select all text on focus for easy replacement
- Update the fork flow (from ticket 11):
  - The optional label input when forking should use a lightweight inline input, not a modal
  - Placeholder text: "Name this branch (optional)"

## Dependencies

- 10 (Branch Forking Service & Context Assembly)
  <!-- Ticket 10 creates: forkBranch, branch entity with label field -->

## Completion requirements

- [ ] `labelBranch` mutation updates the branch label and emits an event
- [ ] Auto-labels are generated from the first turn's content
- [ ] User-set labels take priority over auto-labels
- [ ] Double-click to edit label works in both the tree panel and breadcrumb
- [ ] Label changes propagate in real-time (via event stream) to all components
- [ ] Unnamed branches display the auto-label or "New branch" as fallback
- [ ] Fork flow includes an optional label input

## How to test

1. Create a branch without a label, send a turn — auto-label appears based on the turn content
2. Double-click the branch label in the tree panel — inline editor appears
3. Type a new label, press Enter — label updates everywhere (tree, breadcrumb)
4. Press Escape during editing — edit is cancelled, original label remains
5. Create a branch with a label during the fork flow — label is set immediately
6. Verify `branch.labeled` event is emitted when a label changes
