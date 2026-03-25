# 10 — Branch Forking Service & Context Assembly

## Summary

Implement the core branching logic: creating a new branch from any turn and assembling the correct conversation context by walking the ancestor chain. This is the heart of the branching feature. The context assembly algorithm is zero-copy — no turns are duplicated, context is assembled at inference time by recursively walking parent branches up to their fork points.

## What needs to happen

- Add `forkBranch({ turnId, label?, userId })` to `AiConversationService`:
  - Validate the turn exists and the user has access to the conversation
  - Create a new `Branch` with:
    - `conversationId` = the turn's conversation ID
    - `parentBranchId` = the turn's branch ID
    - `forkTurnId` = the specified turn ID
    - `label` = provided label or null
    - `createdById` = the user
  - Increment the source turn's `branchCount` (or compute it dynamically from `forkedBranches.length`)
  - Emit `branch.created` event
  - Return the new branch
- Implement `buildContext(branchId)` — the recursive context assembly algorithm:
  ```typescript
  function buildContext(branch: Branch, upToTurn?: Turn): Turn[] {
    const turns = getTurnsInBranch(branch, upToTurn);
    if (branch.parentBranchId === null) {
      return turns; // root branch — no ancestors
    }
    const parentBranch = getBranch(branch.parentBranchId);
    const forkTurn = getTurn(branch.forkTurnId);
    const parentContext = buildContext(parentBranch, forkTurn); // recursive
    return [...parentContext, ...turns];
  }
  ```
  - Returns a flat, linear sequence of turns — the full conversation history as the AI sees it
  - Handles arbitrary depth (branch of a branch of a branch)
  - Efficient: only loads turns that are in the ancestor chain, not all turns in the conversation
- Update `sendTurn` to use `buildContext` instead of just fetching the current branch's turns:
  - Before calling the LLM, call `buildContext(branchId)` to get the full inherited context
  - Pass the full context to the LLM
- Add `getBranchAncestors(branchId)`:
  - Returns the ordered list of ancestor branches from root to current
  - Used by the breadcrumb UI (ticket 13)

## Dependencies

- 06 (Zustand Store & Entity Integration)
  <!-- Ticket 06 creates: Zustand store for branches/turns, entity selectors, event handlers -->

## Completion requirements

- [ ] `forkBranch` creates a new branch linked to the correct parent branch and fork turn
- [ ] `buildContext` correctly assembles turns from the full ancestor chain
- [ ] `buildContext` handles depth > 2 (branch of a branch of a branch)
- [ ] `buildContext` stops at the fork turn in each ancestor — does not include turns after the fork point
- [ ] `sendTurn` in a forked branch passes the full inherited context to the LLM
- [ ] `getBranchAncestors` returns the correct ordered ancestor list
- [ ] `branch.created` event is emitted with correct payload
- [ ] Forking does not duplicate any turns (zero-copy)

## How to test

1. Create a conversation, send 3 turns in the root branch
2. Fork from turn 2 — new branch is created with correct `parentBranchId` and `forkTurnId`
3. Send a turn in the new branch — verify the LLM receives turns 1-2 from root + the new turn (not turn 3)
4. Fork the new branch from its first turn — send a turn in this depth-2 branch
5. Verify `buildContext` returns: root turns 1-2 → branch-1 first turn → branch-2 new turn
6. Verify `getBranchAncestors` returns `[root, branch-1, branch-2]`
7. Continue the root branch (send turn 4) — verify it has no knowledge of the forked branches
