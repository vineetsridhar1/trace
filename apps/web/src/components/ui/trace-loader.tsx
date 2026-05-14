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
            .trace-loader-line {
              animation: trace-loader-line 2.8s cubic-bezier(.7,0,.3,1) infinite;
            }

            .trace-loader-wanderer {
              animation: trace-loader-wanderer 2.8s cubic-bezier(.7,0,.3,1) infinite;
              transform-box: view-box;
              transform-origin: center;
            }

            .trace-loader-node {
              animation: trace-loader-node 2.8s cubic-bezier(.7,0,.3,1) infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            .trace-loader-node:nth-of-type(2) {
              animation-delay: .08s;
            }

            .trace-loader-node:nth-of-type(3) {
              animation-delay: .16s;
            }

            .trace-loader-node:nth-of-type(4) {
              animation-delay: .24s;
            }

            @keyframes trace-loader-line {
              0%, 100% {
                stroke-dashoffset: 0;
              }
              36% {
                stroke-dashoffset: -38;
              }
              68% {
                stroke-dashoffset: -76;
              }
            }

            @keyframes trace-loader-wanderer {
              0%, 100% {
                transform: translate(24px, 68px) scale(1);
              }
              18% {
                transform: translate(42px, 47px) scale(.82);
              }
              36% {
                transform: translate(58px, 61px) scale(1.08);
              }
              52% {
                transform: translate(72px, 45px) scale(.9);
              }
              68% {
                transform: translate(88px, 79px) scale(1.12);
              }
              82% {
                transform: translate(96px, 30px) scale(.86);
              }
            }

            @keyframes trace-loader-node {
              0%, 100% {
                opacity: .38;
                transform: scale(.76);
              }
              42% {
                opacity: 1;
                transform: scale(1);
              }
              68% {
                opacity: .52;
                transform: scale(.86);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .trace-loader-line,
              .trace-loader-wanderer,
              .trace-loader-node {
                animation: none;
              }
            }
          `}
        </style>

        <path
          className="trace-loader-line"
          d="M24 68 C38 42 52 88 66 58 C77 35 86 43 96 26"
          stroke="var(--th-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="3 10"
        >
          <animate
            attributeName="d"
            dur="2.8s"
            repeatCount="indefinite"
            keyTimes="0;0.36;0.68;1"
            calcMode="spline"
            keySplines=".7 0 .3 1;.7 0 .3 1;.7 0 .3 1"
            values={[
              "M24 68 C38 42 52 88 66 58 C77 35 86 43 96 26",
              "M24 54 C37 72 51 40 65 66 C78 91 88 70 96 92",
              "M24 72 C40 76 44 34 62 42 C82 50 80 86 96 74",
              "M24 68 C38 42 52 88 66 58 C77 35 86 43 96 26",
            ].join(";")}
          />
        </path>
        <path
          d="M24 68 C38 42 52 88 66 58 C77 35 86 43 96 26"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="1 12"
          className="text-muted-foreground/30"
        />

        <circle className="trace-loader-node" cx="24" cy="68" r="4" fill="currentColor" />
        <circle className="trace-loader-node" cx="50" cy="58" r="3.5" fill="currentColor" />
        <circle className="trace-loader-node" cx="74" cy="45" r="3.5" fill="currentColor" />
        <circle className="trace-loader-node" cx="96" cy="26" r="4" fill="currentColor" />

        <g className="trace-loader-wanderer">
          <circle r="7" fill="var(--th-surface-deep)" stroke="var(--th-accent-light)" strokeWidth="3" />
          <circle r="2.2" fill="#fdfcfd" />
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
