import { useRef, useState, useLayoutEffect } from 'react';
import type { ServerEvent } from '../types';
import { computeThreadTokenUsage, computeApproxCost, formatTokens } from '../utils';

const GAP = 8;

export function TokenUsageBadge({ events }: { events: ServerEvent[] }) {
  const { inputTokens, outputTokens, totalTokens } = computeThreadTokenUsage(events);

  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hovered) return;
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;

    const tr = trigger.getBoundingClientRect();
    const tt = tip.getBoundingClientRect();
    const top = tr.top - tt.height - GAP;
    let left = tr.left + tr.width / 2 - tt.width / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tt.width - 4));

    setCoords({ top, left });
  }, [hovered]);

  if (totalTokens === 0) return null;

  const cost = computeApproxCost(inputTokens, outputTokens);
  const displayCost = cost < 0.01 ? '0.01' : cost.toFixed(2);

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setCoords(null); }}
    >
      <span className="text-[10px] text-[#565f89]">
        {formatTokens(totalTokens)} tokens
      </span>
      {hovered && (
        <div
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none fixed z-[9999] rounded-md border border-[#292e42] bg-[#1f2335] px-2.5 py-2 text-[11px] text-[#c0caf5] shadow-lg"
          style={coords
            ? { top: coords.top, left: coords.left }
            : { top: 0, left: -9999 }
          }
        >
          <div>Input: {formatTokens(inputTokens)} tokens</div>
          <div>Output: {formatTokens(outputTokens)} tokens</div>
          <div className="my-1 border-t border-[#292e42]" />
          <div>Est. cost: ~${displayCost}</div>
        </div>
      )}
    </div>
  );
}
