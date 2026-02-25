# Plan: Add Thread Token Usage Display

## Goal
Show total token usage for each thread (similar to how SubagentRow shows tokens for individual agents), with a hover tooltip showing input/output breakdown and approximate cost.

## Approach

### 1. Compute token usage from thread events (client-side)

Create a utility function `computeThreadTokenUsage(events: ServerEvent[])` in `src/utils.ts` that iterates all thread events and sums:
- `toolResponse.usage.input_tokens` / `output_tokens` from PostToolUse events (Task/subagent events have this)
- `rawPayload.usage` from Stop events (Claude's Stop hook may include session-level token stats)

Returns: `{ inputTokens, outputTokens, totalTokens }`

### 2. Add pricing calculation utility

Create a `computeApproxCost(inputTokens: number, outputTokens: number)` function in `src/utils.ts` using Sonnet pricing as default:
- Input: $3/M tokens
- Output: $15/M tokens

### 3. Create a `TokenUsageBadge` component

New component in `src/components/TokenUsageBadge.tsx`:
- Displays total token count (e.g. "12.3k tokens") in the same style as SubagentRow
- On hover, shows a tooltip with:
  - Input tokens count
  - Output tokens count
  - Approximate cost (e.g. "~$0.23")

The tooltip will be a custom rich tooltip (since the existing `Tooltip` only supports plain text strings), rendered as a positioned div on hover.

### 4. Integrate into ThreadHeader

Add the `TokenUsageBadge` to the ThreadHeader component, positioned next to the status badge. Pass `threadEvents` into ThreadHeader (available from ThreadContext).

## Files to modify
- `src/utils.ts` — add `computeThreadTokenUsage()` and `computeApproxCost()`
- `src/components/TokenUsageBadge.tsx` — new component
- `src/components/ThreadHeader.tsx` — add token usage badge, accept `threadEvents` prop
- `src/components/ThreadPanel.tsx` — pass `threadEvents` to ThreadHeader
