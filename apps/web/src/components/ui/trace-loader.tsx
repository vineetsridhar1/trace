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
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
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

            .trace-loader-light {
              opacity: 0;
              animation: trace-loader-light 1.2s linear infinite;
              animation-delay: calc(var(--snake-index) * -150ms);
              transform-box: fill-box;
              transform-origin: center;
            }

            @keyframes trace-loader-light {
              0%, 100% {
                opacity: 0;
                transform: scale(.82);
              }
              14% {
                opacity: .26;
                transform: scale(.94);
              }
              32% {
                opacity: 1;
                transform: scale(1.18);
              }
              50% {
                opacity: .74;
                transform: scale(1.08);
              }
              68% {
                opacity: .18;
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
          const isSnakeDot = dot.snakeIndex !== undefined;

          return (
            <g key={dot.id}>
              <circle className="trace-loader-dot" cx={cx} cy={cy} r="4.5" fill="currentColor" />
              {isSnakeDot ? (
                <circle
                  className="trace-loader-light"
                  cx={cx}
                  cy={cy}
                  r="5"
                  fill="var(--th-accent-light)"
                  style={{ "--snake-index": dot.snakeIndex } as SnakeDotStyle}
                />
              ) : null}
            </g>
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
