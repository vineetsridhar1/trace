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
        <defs>
          <filter id="trace-loader-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M28 78 C42 42 63 92 92 38"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="2 9"
          className="text-muted-foreground/35"
        />
        <path
          d="M28 78 C42 42 63 92 92 38"
          stroke="var(--th-accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="20 118"
          filter="url(#trace-loader-glow)"
        >
          <animate attributeName="stroke-dashoffset" values="138;0;-138" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="stroke-width" values="3;5;3" dur="1.8s" repeatCount="indefinite" />
        </path>

        <g>
          <circle cx="28" cy="78" r="8" fill="var(--th-surface-deep)" stroke="var(--th-accent-light)" strokeWidth="3" />
          <circle cx="60" cy="64" r="8" fill="var(--th-surface-deep)" stroke="var(--th-accent)" strokeWidth="3" />
          <circle cx="92" cy="38" r="8" fill="var(--th-surface-deep)" stroke="var(--th-accent-light)" strokeWidth="3" />
        </g>

        <circle cx="28" cy="78" r="4" fill="var(--th-accent-light)">
          <animate attributeName="r" values="4;7;4" dur="1.8s" repeatCount="indefinite" begin="0s" />
          <animate attributeName="opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" begin="0s" />
        </circle>
        <circle cx="60" cy="64" r="4" fill="var(--th-accent)">
          <animate attributeName="r" values="4;7;4" dur="1.8s" repeatCount="indefinite" begin="0.25s" />
          <animate attributeName="opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" begin="0.25s" />
        </circle>
        <circle cx="92" cy="38" r="4" fill="var(--th-accent-light)">
          <animate attributeName="r" values="4;7;4" dur="1.8s" repeatCount="indefinite" begin="0.5s" />
          <animate attributeName="opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" begin="0.5s" />
        </circle>

        <g opacity="0.9">
          <circle cx="60" cy="64" r="42" stroke="currentColor" strokeWidth="1" strokeDasharray="1 10" className="text-muted-foreground/25" />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 60 64"
            to="360 60 64"
            dur="8s"
            repeatCount="indefinite"
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
