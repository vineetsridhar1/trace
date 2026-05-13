import { useId } from "react";

import { cn } from "@/lib/utils";

interface TraceLoaderProps {
  className?: string;
  label?: string;
  showLabel?: boolean;
  size?: number;
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
            .trace-loader-mark {
              animation: trace-loader-mark-phase 3.6s cubic-bezier(.7,0,.3,1) infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            .trace-loader-stroke {
              stroke-dasharray: 100;
              animation: trace-loader-stroke-phase 3.6s cubic-bezier(.7,0,.3,1) infinite;
            }

            .trace-loader-node {
              animation: trace-loader-node-phase 3.6s cubic-bezier(.7,0,.3,1) infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            .trace-loader-orbit {
              animation: trace-loader-orbit-phase 3.6s cubic-bezier(.7,0,.3,1) infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            .trace-loader-ring {
              stroke-dasharray: 13 12;
              animation: trace-loader-ring-spin 0.9s linear infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            .trace-loader-spark {
              animation: trace-loader-spark-phase 3.6s cubic-bezier(.7,0,.3,1) infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            @keyframes trace-loader-mark-phase {
              0%, 24%, 100% {
                opacity: 1;
                transform: rotate(0deg) scale(1);
              }
              42%, 70% {
                opacity: 0.18;
                transform: rotate(180deg) scale(0.64);
              }
              82% {
                opacity: 1;
                transform: rotate(360deg) scale(1);
              }
            }

            @keyframes trace-loader-stroke-phase {
              0%, 24% {
                stroke-dashoffset: 0;
              }
              42%, 70% {
                stroke-dashoffset: 100;
              }
              82%, 100% {
                stroke-dashoffset: 0;
              }
            }

            @keyframes trace-loader-node-phase {
              0%, 22%, 100% {
                opacity: 1;
                transform: scale(1);
              }
              38%, 72% {
                opacity: 0;
                transform: scale(0.4);
              }
              84% {
                opacity: 1;
                transform: scale(1.12);
              }
            }

            @keyframes trace-loader-orbit-phase {
              0%, 28%, 78%, 100% {
                opacity: 0;
                transform: scale(0.7) rotate(0deg);
              }
              42% {
                opacity: 1;
                transform: scale(1) rotate(0deg);
              }
              70% {
                opacity: 1;
                transform: scale(1) rotate(360deg);
              }
            }

            @keyframes trace-loader-ring-spin {
              to {
                transform: rotate(360deg);
              }
            }

            @keyframes trace-loader-spark-phase {
              0%, 28%, 78%, 100% {
                opacity: 0;
                transform: rotate(0deg) translateY(-34px) scale(0.55);
              }
              44% {
                opacity: 1;
                transform: rotate(0deg) translateY(-34px) scale(1);
              }
              70% {
                opacity: 1;
                transform: rotate(360deg) translateY(-34px) scale(1);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .trace-loader-mark,
              .trace-loader-stroke,
              .trace-loader-node,
              .trace-loader-orbit,
              .trace-loader-ring,
              .trace-loader-spark {
                animation: none;
              }
            }
          `}
        </style>

        <defs>
          <linearGradient id={blueGradientId} x1="19" x2="101" y1="26" y2="26" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0189fd" />
            <stop offset="1" stopColor="#004eef" />
          </linearGradient>
          <linearGradient id={purpleGradientId} x1="60" x2="60" y1="26" y2="101" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0189fd" />
            <stop offset="1" stopColor="#7223fb" />
          </linearGradient>
          <filter id={glowId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="60" cy="60" r="43" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/15" />

        <g className="trace-loader-orbit" filter={`url(#${glowId})`}>
          <circle
            className="trace-loader-ring"
            cx="60"
            cy="60"
            r="34"
            stroke={`url(#${purpleGradientId})`}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle className="trace-loader-spark" cx="60" cy="60" r="5" fill="#fdfcfd" stroke="#0189fd" strokeWidth="3" />
        </g>

        <g className="trace-loader-mark" filter={`url(#${glowId})`}>
          <path
            className="trace-loader-stroke"
            pathLength={100}
            d="M19 26H101"
            stroke={`url(#${blueGradientId})`}
            strokeWidth="17"
            strokeLinecap="round"
          />
          <path
            className="trace-loader-stroke"
            pathLength={100}
            d="M60 60V101"
            stroke={`url(#${purpleGradientId})`}
            strokeWidth="17"
            strokeLinecap="round"
          />
          <path
            className="trace-loader-stroke"
            pathLength={100}
            d="M60 60V43C60 33 66 26 78 26H97"
            stroke={`url(#${purpleGradientId})`}
            strokeWidth="17"
            strokeLinecap="round"
          />
          <path
            className="trace-loader-stroke"
            pathLength={100}
            d="M60 43V60"
            stroke={`url(#${purpleGradientId})`}
            strokeWidth="17"
            strokeLinecap="round"
          />

          <circle className="trace-loader-node" cx="19" cy="26" r="10" fill="#fdfcfd" stroke="#016afc" strokeWidth="4" />
          <circle className="trace-loader-node" cx="101" cy="26" r="10" fill="#fdfcfd" stroke="#0264f6" strokeWidth="4" />
          <circle className="trace-loader-node" cx="60" cy="60" r="10" fill="#fdfcfd" stroke="#6d2ff9" strokeWidth="4" />
          <circle className="trace-loader-node" cx="60" cy="101" r="10" fill="#fdfcfd" stroke="#7123f9" strokeWidth="4" />
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
