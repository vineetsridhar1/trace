import type { ServerEvent } from '../types';
import { computeThreadTokenUsage, computeApproxCost, formatTokens } from '../utils';
import { Tooltip } from './Tooltip';

export function TokenUsageBadge({ events }: { events: ServerEvent[] }) {
  const { inputTokens, outputTokens, totalTokens } = computeThreadTokenUsage(events);

  if (totalTokens === 0) return null;

  const cost = computeApproxCost(inputTokens, outputTokens);
  const displayCost = cost < 0.01 ? '0.01' : cost.toFixed(2);

  return (
    <Tooltip
      position="bottom"
      text={
        <>
          <div>Input: {formatTokens(inputTokens)} tokens</div>
          <div>Output: {formatTokens(outputTokens)} tokens</div>
          <div className="my-1 border-t border-[#292e42]" />
          <div>Est. cost: ~${displayCost}</div>
        </>
      }
    >
      <span className="text-[10px] text-[#565f89]">
        {formatTokens(totalTokens)} tokens
      </span>
    </Tooltip>
  );
}
