import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface TraceLoaderProps {
  className?: string;
  color?: CSSProperties["color"];
  label?: string;
  showLabel?: boolean;
  size?: number;
}

const GRID_SIZE = 3;
const DOT_SPACING = 22;
const GRID_ORIGIN = 38;

const dots = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
  const x = index % GRID_SIZE;
  const y = Math.floor(index / GRID_SIZE);

  return {
    id: `${x}:${y}`,
    x,
    y,
  };
});

export function TraceLoader({
  className,
  color,
  label = "Loading",
  showLabel = true,
  size = 96,
}: TraceLoaderProps) {
  const renderedSize = Math.max(size, 16);

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center justify-center gap-3",
        color ? undefined : "text-muted-foreground",
        className,
      )}
      style={color ? { color } : undefined}
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
              opacity: .32;
            }

            .trace-loader-cursor {
              opacity: .9;
              animation: trace-loader-cursor 1.6s linear infinite;
              transform-box: view-box;
              transform-origin: center;
            }

            @keyframes trace-loader-cursor {
              0% { transform: translate(-18.333%, -18.333%); }
              6.25% { transform: translate(0, -18.333%); }
              12.5% { transform: translate(18.333%, -18.333%); }
              18.75% { transform: translate(18.333%, 0); }
              25% { transform: translate(0, 0); }
              31.25% { transform: translate(-18.333%, 0); }
              37.5% { transform: translate(-18.333%, 18.333%); }
              43.75% { transform: translate(0, 18.333%); }
              50% { transform: translate(18.333%, 18.333%); }
              56.25% { transform: translate(18.333%, 0); }
              62.5% { transform: translate(18.333%, -18.333%); }
              68.75% { transform: translate(0, -18.333%); }
              75% { transform: translate(0, 0); }
              81.25% { transform: translate(0, 18.333%); }
              87.5% { transform: translate(-18.333%, 18.333%); }
              93.75% { transform: translate(-18.333%, 0); }
              100% { transform: translate(-18.333%, -18.333%); }
            }

            @media (prefers-reduced-motion: reduce) {
              .trace-loader-cursor {
                animation: none;
              }
            }
          `}
        </style>

        {dots.map((dot) => {
          const cx = GRID_ORIGIN + dot.x * DOT_SPACING;
          const cy = GRID_ORIGIN + dot.y * DOT_SPACING;

          return (
            <circle
              key={dot.id}
              className="trace-loader-dot"
              cx={cx}
              cy={cy}
              r="4.5"
              fill="currentColor"
            />
          );
        })}

        <circle
          className="trace-loader-cursor"
          cx={GRID_ORIGIN + DOT_SPACING}
          cy={GRID_ORIGIN + DOT_SPACING}
          r="6"
          fill="currentColor"
        />
      </svg>

      {showLabel ? (
        <span className="text-xs font-medium tracking-normal text-muted-foreground">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
