import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface TraceLoaderProps {
  className?: string;
  label?: string;
  showLabel?: boolean;
  size?: number;
}

const GRID_SIZE = 3;
const DOT_SPACING = 22;
const GRID_ORIGIN = 38;
const SNAKE_PATH = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [2, 1],
  [2, 0],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 1],
] as const;

const dots = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
  const x = index % GRID_SIZE;
  const y = Math.floor(index / GRID_SIZE);

  return {
    id: `${x}:${y}`,
    x,
    y,
  };
});

const snakeLights = SNAKE_PATH.map(([x, y], index) => ({
  id: `${x}:${y}:${index}`,
  x,
  y,
  snakeIndex: index,
}));

type SnakeDotStyle = CSSProperties & {
  "--snake-index": number;
};

export function TraceLoader({
  className,
  label = "Loading",
  showLabel = true,
  size = 96,
}: TraceLoaderProps) {
  const renderedSize = Math.max(size, 16);

  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}
      role="status"
      aria-label={label}
    >
      <svg
        width={renderedSize}
        height={renderedSize}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="overflow-visible"
      >
        <style>
          {`
            .trace-loader-dot {
              opacity: .24;
              transform-box: fill-box;
              transform-origin: center;
            }

            .trace-loader-light {
              opacity: 0;
              animation: trace-loader-light 1.28s linear infinite;
              animation-delay: calc(var(--snake-index) * -80ms);
              transform-box: fill-box;
              transform-origin: center;
            }

            @keyframes trace-loader-light {
              0%, 100% {
                opacity: 0;
                transform: scale(.84);
              }
              6% {
                opacity: .18;
                transform: scale(.92);
              }
              12% {
                opacity: 1;
                transform: scale(1.22);
              }
              24% {
                opacity: .86;
                transform: scale(1.08);
              }
              34% {
                opacity: 0;
                transform: scale(.9);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .trace-loader-light {
                animation: none;
              }
            }
          `}
        </style>

        {dots.map((dot) => {
          const cx = GRID_ORIGIN + dot.x * DOT_SPACING;
          const cy = GRID_ORIGIN + dot.y * DOT_SPACING;

          return (
            <circle key={dot.id} className="trace-loader-dot" cx={cx} cy={cy} r="4.5" fill="currentColor" />
          );
        })}

        {snakeLights.map((dot) => {
          const cx = GRID_ORIGIN + dot.x * DOT_SPACING;
          const cy = GRID_ORIGIN + dot.y * DOT_SPACING;

          return (
            <circle
              key={dot.id}
              className="trace-loader-light"
              cx={cx}
              cy={cy}
              r="5"
              fill="currentColor"
              style={{ "--snake-index": dot.snakeIndex } as SnakeDotStyle}
            />
          );
        })}
      </svg>

      {showLabel ? (
        <span className="text-xs font-medium tracking-normal text-muted-foreground">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
