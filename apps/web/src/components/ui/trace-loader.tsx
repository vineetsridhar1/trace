import { useId } from "react";

import { cn } from "@/lib/utils";

interface TraceLoaderProps {
  className?: string;
  label?: string;
  showLabel?: boolean;
  size?: number;
}

const DURATION = "4s";
const KEY_TIMES = "0;0.24;0.4;0.66;0.82;1";

function values(...points: string[]) {
  return points.join(";");
}

export function TraceLoader({
  className,
  label = "Loading",
  showLabel = true,
  size = 96,
}: TraceLoaderProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const blueGradientId = `trace-loader-blue-${id}`;
  const purpleGradientId = `trace-loader-purple-${id}`;
  const glowId = `trace-loader-glow-${id}`;

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
            .trace-loader-shape {
              transform-box: view-box;
              transform-origin: 60px 60px;
            }

            .trace-loader-node {
              transform-box: fill-box;
              transform-origin: center;
            }

            @media (prefers-reduced-motion: reduce) {
              .trace-loader-shape,
              .trace-loader-node {
                animation: none;
              }
            }
          `}
        </style>

        <defs>
          <linearGradient id={blueGradientId} x1="20" x2="100" y1="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0189fd" />
            <stop offset="1" stopColor="#004eef" />
          </linearGradient>
          <linearGradient id={purpleGradientId} x1="60" x2="60" y1="28" y2="102" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0189fd" />
            <stop offset="1" stopColor="#7223fb" />
          </linearGradient>
          <filter id={glowId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="60" cy="60" r="42" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/15" />

        <g className="trace-loader-shape" filter={`url(#${glowId})`}>
          <animateTransform
            attributeName="transform"
            type="rotate"
            dur={DURATION}
            repeatCount="indefinite"
            keyTimes={KEY_TIMES}
            values="0 60 60;0 60 60;0 60 60;360 60 60;360 60 60;360 60 60"
            calcMode="spline"
            keySplines=".7 0 .3 1;.7 0 .3 1;.3 0 .1 1;.7 0 .3 1;.7 0 .3 1"
          />

          <line
            x1="20"
            y1="28"
            x2="100"
            y2="28"
            stroke={`url(#${blueGradientId})`}
            strokeWidth="16"
            strokeLinecap="round"
          >
            <animate attributeName="x1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("20", "20", "36", "36", "20", "20")} />
            <animate attributeName="y1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("28", "28", "36", "36", "28", "28")} />
            <animate attributeName="x2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("100", "100", "84", "84", "100", "100")} />
            <animate attributeName="y2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("28", "28", "36", "36", "28", "28")} />
          </line>

          <line
            x1="60"
            y1="28"
            x2="60"
            y2="60"
            stroke={`url(#${purpleGradientId})`}
            strokeWidth="16"
            strokeLinecap="round"
          >
            <animate attributeName="x1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "36", "36", "60", "60")} />
            <animate attributeName="y1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("28", "28", "36", "36", "28", "28")} />
            <animate attributeName="x2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "36", "36", "60", "60")} />
            <animate attributeName="y2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "84", "84", "60", "60")} />
          </line>

          <line
            x1="100"
            y1="28"
            x2="60"
            y2="60"
            stroke={`url(#${purpleGradientId})`}
            strokeWidth="16"
            strokeLinecap="round"
          >
            <animate attributeName="x1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("100", "100", "84", "84", "100", "100")} />
            <animate attributeName="y1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("28", "28", "36", "36", "28", "28")} />
            <animate attributeName="x2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "84", "84", "60", "60")} />
            <animate attributeName="y2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "84", "84", "60", "60")} />
          </line>

          <line
            x1="60"
            y1="60"
            x2="60"
            y2="102"
            stroke={`url(#${purpleGradientId})`}
            strokeWidth="16"
            strokeLinecap="round"
          >
            <animate attributeName="x1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "84", "84", "60", "60")} />
            <animate attributeName="y1" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "84", "84", "60", "60")} />
            <animate attributeName="x2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "36", "36", "60", "60")} />
            <animate attributeName="y2" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("102", "102", "84", "84", "102", "102")} />
          </line>

          <circle className="trace-loader-node" cx="20" cy="28" r="9" fill="#fdfcfd" stroke="#016afc" strokeWidth="4">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("20", "20", "36", "36", "20", "20")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("28", "28", "36", "36", "28", "28")} />
          </circle>
          <circle className="trace-loader-node" cx="100" cy="28" r="9" fill="#fdfcfd" stroke="#0264f6" strokeWidth="4">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("100", "100", "84", "84", "100", "100")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("28", "28", "36", "36", "28", "28")} />
          </circle>
          <circle className="trace-loader-node" cx="60" cy="60" r="9" fill="#fdfcfd" stroke="#6d2ff9" strokeWidth="4">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "84", "84", "60", "60")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "84", "84", "60", "60")} />
          </circle>
          <circle className="trace-loader-node" cx="60" cy="102" r="9" fill="#fdfcfd" stroke="#7123f9" strokeWidth="4">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("60", "60", "36", "36", "60", "60")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("102", "102", "84", "84", "102", "102")} />
          </circle>
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
