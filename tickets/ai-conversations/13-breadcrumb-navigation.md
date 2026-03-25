# 13 — Breadcrumb Navigation

## Summary

Add a breadcrumb trail at the top of the conversation view showing the current branch's ancestry. The breadcrumb reads like `Root → gRPC tangent → latency benchmarks`, with each crumb clickable to navigate to that branch. This gives users constant awareness of where they are in the branch tree and a fast way to jump up the hierarchy.

## What needs to happen

- Create `apps/web/src/components/ai-conversations/BranchBreadcrumb.tsx`:
  - Renders the ancestor chain for the current branch as a horizontal breadcrumb
  - Each crumb shows the branch label (or auto-label from first turn)
  - Separator between crumbs: `→` or `›` or `/`
  - Current branch (last crumb) is styled differently (bold, not clickable)
  - All other crumbs are clickable — clicking navigates to that branch
  - Root branch always shows as "Root" or the conversation title
- Use `getBranchAncestors` from the service layer (or compute client-side by walking `parentBranch` in the store)
- Place the breadcrumb at the top of the conversation view, below any header/toolbar
- Handle long breadcrumbs:
  - If the ancestry is deep (>4 levels), collapse middle crumbs with `...` and show only root + last 2
  - Hovering or clicking `...` reveals the full path in a dropdown
- Handle the root branch case:
  - When on the root branch, breadcrumb shows just the conversation title (or "Root") — no navigation needed
  - Hide the breadcrumb entirely if there's only one branch (no branching has happened)

## Dependencies

- 10 (Branch Forking Service & Context Assembly)
  <!-- Ticket 10 creates: getBranchAncestors, branch parent/child relationships -->

## Completion requirements

- [ ] Breadcrumb renders the full ancestor chain for the current branch
- [ ] Each crumb is clickable and navigates to that branch
- [ ] Current branch is styled as non-clickable (bold or different color)
- [ ] Root branch shows as "Root" or conversation title
- [ ] Long breadcrumbs collapse middle items with `...`
- [ ] Breadcrumb is hidden when on root with no other branches
- [ ] Breadcrumb updates when navigating between branches

## How to test

1. Create a conversation with branches at depth 3 — breadcrumb shows `Root → Branch A → Branch B`
2. Click "Root" in the breadcrumb — view switches to root branch
3. Click "Branch A" — view switches to Branch A
4. Create a branch at depth 5+ — verify middle crumbs collapse to `...`
5. Click `...` — full path is revealed
6. Navigate to root in a conversation with no branches — breadcrumb is hidden
