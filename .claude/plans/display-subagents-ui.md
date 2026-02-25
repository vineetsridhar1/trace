# Plan: Display Subagents UI

## Context

When Claude uses the `Task` tool, it spawns subagents (Explore, Plan, general-purpose, etc.) that run autonomously. Multiple can run in parallel. Currently these show up as generic `GenericToolRow` events with raw JSON. We need a proper UI that groups them together and shows loading/completed states.

## Data Shape

**Task PostToolUse events have:**
- `toolInput.description` — short label (e.g., "Explore GraphQL schema")
- `toolInput.subagent_type` — "Explore", "Plan", "general-purpose"
- `toolInput.prompt` — full prompt sent to the subagent
- `toolResponse.agentId` — unique agent ID
- `toolResponse.status` — "completed"
- `toolResponse.content` — array with `{ text: "..." }` blocks (the result)
- `toolResponse.usage` — `{ input_tokens, output_tokens, duration_ms, tool_uses }`

**Key behavior:** Claude can launch multiple Task calls in a single turn (parallel). PostToolUse fires only after each completes, so events arrive one-by-one as each subagent finishes.

## Approach

Follow the existing `ReadGlobGroupNode` pattern: group consecutive Task events into a single collapsible node, with individual subagent rows inside.

## Changes

### 1. `src/types.ts` — Add SubagentGroupNode type

Add a new node type to the union:

```ts
export interface SubagentGroupNode {
  kind: 'subagent-group';
  id: string;
  count: number;
  startTimestamp: string;
  endTimestamp: string;
  events: ServerEvent[];
}

export type ThreadRenderNode =
  ThreadEventNode | ReadGlobGroupNode | PlanReviewNode | AskUserQuestionNode | SubagentGroupNode;
```

### 2. `src/utils.ts` — Group Task events in `buildThreadNodes()`

Add a `isTaskEvent()` helper (like `isReadLikeEvent`), then modify the grouping logic in `buildThreadNodes()` to batch consecutive Task events into `SubagentGroupNode`, similar to how Read/Glob events are grouped.

The grouping approach: extend the existing bucket logic to also handle Task events in a separate `taskBucket`, flushing it when a non-Task event is encountered.

### 3. `src/components/SubagentGroup.tsx` — New component

Renders a `SubagentGroupNode` with:
- **Header row**: "{count} subagents" with time range, expandable chevron
- **Individual subagent rows** (always visible, not just when expanded):
  - Type badge (Explore/Plan/general-purpose) with color coding
  - Description text from `toolInput.description`
  - Status indicator: green checkmark for completed
  - Token usage summary (compact)
- **Expanded content**: when a subagent row is clicked, show the full result text (from `toolResponse.content[].text`) in an expandable area
- **Loading indicator**: if `isClaudeRunning` is passed and this is the last node, show a subtle pulsing/spinner at the bottom suggesting more agents may still be running

Visual style: follows the existing `activity-row` pattern with `react-icons/fi` icons (FiCpu or FiGitBranch for the agent icon, FiCheck for completed).

### 4. `src/components/ThreadPanel.tsx` — Render the new node kind

Add a case in the `threadNodes.map()` loop:

```tsx
if (node.kind === 'subagent-group') {
  return <SubagentGroup key={node.id} node={node} isLastNode={i === threadNodes.length - 1} isClaudeRunning={isClaudeRunning} />;
}
```

### 5. `src/components/ThreadEvent.tsx` — Hide Task events from GenericToolRow

Add `isTaskEvent()` check in `ToolUseRow` so that individual Task events return `null` (they're handled by the group component). This prevents double-rendering if a Task event somehow doesn't get grouped.

## Files Modified
1. `src/types.ts` — add SubagentGroupNode interface + update union type
2. `src/utils.ts` — add isTaskEvent(), modify buildThreadNodes() grouping
3. `src/components/SubagentGroup.tsx` — **new file**, the subagent group component
4. `src/components/ThreadPanel.tsx` — add subagent-group case in render loop
5. `src/components/ThreadEvent.tsx` — add Task guard in ToolUseRow

## Design Details

- Each subagent row shows: colored type badge | description | status icon
- Clicking a row expands it to show the truncated result content (like ExpandableText)
- The group header is collapsible (like ReadGlobGroup) — collapsed by default once Claude has moved past them
- While Claude is running and this group is the last node, show a spinner row at the bottom: "Running agents..."
- Use Feather icons from `react-icons/fi` per project convention
