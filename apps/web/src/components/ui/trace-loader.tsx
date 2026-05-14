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
] as const;

const snakeIndexByPoint = new Map(SNAKE_PATH.map(([x, y], index) => [`${x}:${y}`, index]));
const dots = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
  const x = index % GRID_SIZE;
  const y = Math.floor(index / GRID_SIZE);

  return {
    id: `${x}:${y}`,
    x,
    y,
    snakeIndex: snakeIndexByPoint.get(`${x}:${y}`),
  };
});

type SnakeDotStyle = CSSProperties & {
  "--snake-index": number;
};

export function TraceLoader({
  className,
  label = "Loading",
  showLabel = true,
  size = 96,
}: TraceLoaderProps) {
  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}
      role="status"
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
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

            .trace-loader-dot-active {
              animation: trace-loader-snake 1.8s linear infinite;
              animation-delay: calc(var(--snake-index) * -200ms);
            }

            @keyframes trace-loader-snake {
              0%, 100% {
                fill: currentColor;
                opacity: .24;
                transform: scale(.74);
              }
              8%, 42% {
                fill: var(--th-accent-light);
                opacity: 1;
                transform: scale(1.28);
              }
              52% {
                fill: var(--th-accent);
                opacity: .52;
                transform: scale(.94);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .trace-loader-dot-active {
                animation: none;
              }
            }
          `}
        </style>

        {dots.map((dot) => {
          const cx = GRID_ORIGIN + dot.x * DOT_SPACING;
          const cy = GRID_ORIGIN + dot.y * DOT_SPACING;
          const isSnakeDot = dot.snakeIndex !== undefined;

          return (
            <circle
              key={dot.id}
              className={cn("trace-loader-dot", isSnakeDot && "trace-loader-dot-active")}
              cx={cx}
              cy={cy}
              r="4.5"
              fill="currentColor"
              style={isSnakeDot ? ({ "--snake-index": dot.snakeIndex } as SnakeDotStyle) : undefined}
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
