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
              animation: trace-loader-cursor 1.6s linear infinite;
              transform-box: view-box;
              transform-origin: center;
            }

            .trace-loader-trail-far {
              opacity: .16;
            }

            .trace-loader-trail-near {
              opacity: .38;
            }

            .trace-loader-head {
              opacity: .92;
            }

            @keyframes trace-loader-cursor {
              0% { transform: translate(-18.333%, -18.333%) rotate(0deg); }
              6.25% { transform: translate(0, -18.333%) rotate(0deg); }
              12.5% { transform: translate(18.333%, -18.333%) rotate(90deg); }
              18.75% { transform: translate(18.333%, 0) rotate(180deg); }
              25% { transform: translate(0, 0) rotate(180deg); }
              31.25% { transform: translate(-18.333%, 0) rotate(90deg); }
              37.5% { transform: translate(-18.333%, 18.333%) rotate(0deg); }
              43.75% { transform: translate(0, 18.333%) rotate(0deg); }
              50% { transform: translate(18.333%, 18.333%) rotate(-90deg); }
              56.25% { transform: translate(18.333%, 0) rotate(-90deg); }
              62.5% { transform: translate(18.333%, -18.333%) rotate(-180deg); }
              68.75% { transform: translate(0, -18.333%) rotate(-270deg); }
              75% { transform: translate(0, 0) rotate(-270deg); }
              81.25% { transform: translate(0, 18.333%) rotate(-180deg); }
              87.5% { transform: translate(-18.333%, 18.333%) rotate(-90deg); }
              93.75% { transform: translate(-18.333%, 0) rotate(-90deg); }
              100% { transform: translate(-18.333%, -18.333%) rotate(0deg); }
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

        <g className="trace-loader-cursor">
          <rect
            className="trace-loader-trail-far"
            x={GRID_ORIGIN + DOT_SPACING - 17}
            y={GRID_ORIGIN + DOT_SPACING - 2.5}
            width="9"
            height="5"
            rx="2.5"
            fill="currentColor"
          />
          <rect
            className="trace-loader-trail-near"
            x={GRID_ORIGIN + DOT_SPACING - 10}
            y={GRID_ORIGIN + DOT_SPACING - 3.5}
            width="10"
            height="7"
            rx="3.5"
            fill="currentColor"
          />
          <circle
            className="trace-loader-head"
            cx={GRID_ORIGIN + DOT_SPACING}
            cy={GRID_ORIGIN + DOT_SPACING}
            r="6"
            fill="currentColor"
          />
        </g>
      </svg>

      {showLabel ? (
        <span className="text-xs font-medium tracking-normal text-muted-foreground">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
