# 20 — Context Management & Rolling Summaries

## Summary

Implement the context management system to handle long conversations and deep branch trees without exceeding LLM context windows. The v1 approach combines rolling summaries with a token budget allocation system. When a branch exceeds a threshold, older turns are collapsed into a stored summary. A context health indicator in the UI shows users how much of the context window is in use. Context is never silently dropped — summarized sections are visible and expandable.

## What needs to happen

### Rolling Summaries
- Add a `BranchSummary` model to Prisma (or a `summary` field on `Branch`):
  - `branchId` — the branch being summarized
  - `content` — the summary text
  - `summarizedTurnCount` — how many turns were summarized
  - `summarizedUpToTurnId` — the last turn included in the summary
  - `createdAt`
- Implement auto-summarization in the service layer:
  - When a branch exceeds the threshold (default: 40 turns), trigger summarization
  - Summarize the oldest half of the turns using the LLM
  - Store the summary, mark those turns as "summarized" (they're still in the DB but excluded from context assembly)
  - Summarization preserves: decisions made, key facts established, open threads
- Update `buildContext` to use summaries:
  - If a branch has a summary, prepend it as a system message instead of the raw turns
  - Apply token budget allocation across ancestor levels
- Extend the GraphQL + store surface so summaries are first-class in the UI:
  - Expose summary metadata and context-health metrics in conversation/branch queries
  - Emit a branch summary event (for example `branch.summary_updated`) when a summary is created or refreshed
  - Update the AI Conversations event processor and `useBranchTimeline()` selector so summary nodes render through the same virtualized timeline as turns

### Token Budget Allocation
- Implement the budget system from the PRD:
  - Current branch: 60% of context window
  - Parent branch: 20%
  - Grandparent: 12%
  - Great-grandparent: 6%
  - Deeper ancestors: 2% (shared, summarized aggressively)
- Token counting: estimate tokens from turn content length (rough heuristic: chars / 4)
- When a level exceeds its budget, summarize the overflow

### Context Health Indicator
- Add a token usage bar to the conversation header:
  - Shows current context usage as a percentage of the model's context window
  - Color changes: green (<50%), yellow (50-70%), orange (70-90%), red (>90%)
  - Tooltip shows breakdown: "Current branch: 2.4k tokens, Ancestors: 1.2k tokens, Budget: 8k tokens"
- When context usage exceeds ~70%, trigger background auto-summarization of ancestors

### Summary UI
- Summarized sections appear as collapsible "Summary" nodes in the turn list
- Shows "X turns summarized" with an expand button
- Expanding reveals the summary text (not the raw turns — those are only in the DB)
- Collapsed by default

### User-Triggered Summarization
- Add `summarizeBranch` service method and mutation:
  - Generates a 2-3 sentence summary of a branch
  - Posts the summary as a special turn in the parent branch at the fork point
  - Used for manually collapsing a resolved tangent

## Dependencies

- 03 (Turn Service & LLM Integration)
  <!-- Ticket 03 creates: LLM adapter integration, which summarization reuses for summary generation -->
- 06 (Zustand Store & Entity Integration)
  <!-- Ticket 06 creates: the branch timeline selector, store pipeline, and viewport subscriptions that summary nodes plug into -->
- 08 (Conversation View & Turn Rendering)
  <!-- Ticket 08 creates: the conversation header and virtualized timeline that will host summary nodes and context health -->
- 10 (Branch Forking Service & Context Assembly)
  <!-- Ticket 10 creates: buildContext recursive algorithm and ancestor chain walking -->

## Completion requirements

- [ ] Rolling summaries trigger automatically when a branch exceeds the turn threshold
- [ ] Summaries are stored and used in context assembly instead of raw turns
- [ ] Token budget allocation works across ancestor levels (60/20/12/6/2 split)
- [ ] `buildContext` respects token budgets and uses summaries where needed
- [ ] Context health indicator shows current usage in the conversation header
- [ ] Auto-summarization triggers at ~70% capacity
- [ ] Summarized sections appear as collapsible nodes in the turn list
- [ ] Summary metadata and context-health values are exposed through the GraphQL/store/event pipeline for multi-client consistency
- [ ] `summarizeBranch` mutation creates a summary turn in the parent branch
- [ ] Raw turns are never deleted — only excluded from live context assembly
- [ ] Context is never silently dropped — all compression is visible in the UI

## How to test

1. Create a conversation and send 45 turns — auto-summarization triggers at turn 40
2. Verify the summary node appears in the turn list ("20 turns summarized")
3. Expand the summary — summary text is visible
4. Send another turn — verify the LLM context includes the summary (not the raw turns)
5. Check the context health indicator — shows accurate token usage
6. Create a deep branch tree (depth 4) — verify token budgets are allocated correctly
7. Use `summarizeBranch` on a branch — summary turn appears in the parent branch
8. Verify context stays under the model's limit even with hundreds of total turns
