import { useState } from 'react';
import { formatTokens } from '../utils';

const CONTEXT_WINDOW_LIMIT = 200_000;

export function ContextProgressBar({ latestContextTokens }: { latestContextTokens: number }) {
  const inputTokens = latestContextTokens;
  const [hovered, setHovered] = useState(false);

  if (inputTokens === 0) return null;

  const usagePercent = Math.min((inputTokens / CONTEXT_WINDOW_LIMIT) * 100, 100);

  return (
    <div
      className="group relative w-full shrink-0 px-3 pb-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#1a1b26]">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${Math.max(usagePercent, 0.5)}%`,
            background: 'linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 100%)',
            backgroundSize: `${(100 / usagePercent) * 100}% 100%`,
          }}
        />
      </div>
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-[9999] mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#292e42] bg-[#1f2335] px-2 py-1 text-[11px] text-[#c0caf5] shadow-lg">
          Context: {formatTokens(inputTokens)} / {formatTokens(CONTEXT_WINDOW_LIMIT)} tokens ({usagePercent.toFixed(1)}%)
        </div>
      )}
    </div>
  );
}
