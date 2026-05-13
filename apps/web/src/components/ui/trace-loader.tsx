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
const EASE = ".7 0 .3 1;.7 0 .3 1;.3 0 .1 1;.7 0 .3 1;.7 0 .3 1";
const CENTER = "328.5 335";

function values(...items: string[]) {
  return items.join(";");
}

export function TraceLoader({
  className,
  label = "Loading",
  showLabel = true,
  size = 96,
}: TraceLoaderProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const topGradientId = `trace-loader-top-${id}`;
  const stemGradientId = `trace-loader-stem-${id}`;
  const branchGradientId = `trace-loader-branch-${id}`;
  const capGradientId = `trace-loader-cap-${id}`;
  const lowerGradientId = `trace-loader-lower-${id}`;
  const centerGradientId = `trace-loader-center-${id}`;

  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}
      role="status"
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 657 670"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={topGradientId} x1="247" x2="425.5" y1="69.5" y2="69.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#016afa" />
            <stop offset="1" stopColor="#004eef" />
          </linearGradient>
          <linearGradient id={stemGradientId} x1="311" x2="311" y1="211.5" y2="329" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0189fd" />
            <stop offset="1" stopColor="#6e2ef9" />
          </linearGradient>
          <linearGradient id={branchGradientId} x1="438" x2="569.5" y1="69" y2="69" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0186fd" />
            <stop offset="1" stopColor="#014ef2" />
          </linearGradient>
          <linearGradient id={capGradientId} x1="311" x2="311" y1="201.324" y2="282.031" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0189fd" />
            <stop offset="1" stopColor="#6e2ef9" />
          </linearGradient>
          <linearGradient id={lowerGradientId} x1="311" x2="311" y1="387.664" y2="568.069" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7223fb" />
            <stop offset="1" stopColor="#6e2ef9" />
          </linearGradient>
          <linearGradient id={centerGradientId} x1="310.5" x2="310.5" y1="295" y2="384" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5b3bfa" />
            <stop offset="1" stopColor="#6d2ff9" />
          </linearGradient>
        </defs>

        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            dur={DURATION}
            repeatCount="indefinite"
            keyTimes={KEY_TIMES}
            values={`0 ${CENTER};0 ${CENTER};0 ${CENTER};360 ${CENTER};360 ${CENTER};360 ${CENTER}`}
            calcMode="spline"
            keySplines={EASE}
          />

          <path
            stroke={`url(#${topGradientId})`}
            strokeLinecap="round"
            strokeWidth="104"
            d="M65 69 C65 69 589 69 589 69 C589 69 589 69 589 69"
          >
            <animate
              attributeName="d"
              dur={DURATION}
              repeatCount="indefinite"
              keyTimes={KEY_TIMES}
              calcMode="spline"
              keySplines={EASE}
              values={values(
                "M65 69 C65 69 589 69 589 69 C589 69 589 69 589 69",
                "M65 69 C65 69 589 69 589 69 C589 69 589 69 589 69",
                "M83.5 335 C83.5 199.7 193.2 90 328.5 90 C463.8 90 573.5 199.7 573.5 335",
                "M83.5 335 C83.5 199.7 193.2 90 328.5 90 C463.8 90 573.5 199.7 573.5 335",
                "M65 69 C65 69 589 69 589 69 C589 69 589 69 589 69",
                "M65 69 C65 69 589 69 589 69 C589 69 589 69 589 69",
              )}
            />
          </path>

          <path
            stroke={`url(#${stemGradientId})`}
            strokeLinecap="round"
            strokeWidth="104"
            d="M311 328.955 C311 328.955 311 236.205 311 180.455 C311 124.455 347.496 69 420.998 69 C420.998 69 493.496 69 565.995 69"
          >
            <animate
              attributeName="d"
              dur={DURATION}
              repeatCount="indefinite"
              keyTimes={KEY_TIMES}
              calcMode="spline"
              keySplines={EASE}
              values={values(
                "M311 328.955 C311 328.955 311 236.205 311 180.455 C311 124.455 347.496 69 420.998 69 C420.998 69 493.496 69 565.995 69",
                "M311 328.955 C311 328.955 311 236.205 311 180.455 C311 124.455 347.496 69 420.998 69 C420.998 69 493.496 69 565.995 69",
                "M328.5 90 C463.8 90 573.5 199.7 573.5 335 C573.5 470.3 463.8 580 328.5 580 C328.5 580 328.5 580 328.5 580",
                "M328.5 90 C463.8 90 573.5 199.7 573.5 335 C573.5 470.3 463.8 580 328.5 580 C328.5 580 328.5 580 328.5 580",
                "M311 328.955 C311 328.955 311 236.205 311 180.455 C311 124.455 347.496 69 420.998 69 C420.998 69 493.496 69 565.995 69",
                "M311 328.955 C311 328.955 311 236.205 311 180.455 C311 124.455 347.496 69 420.998 69 C420.998 69 493.496 69 565.995 69",
              )}
            />
          </path>

          <path
            stroke={`url(#${branchGradientId})`}
            strokeLinecap="round"
            strokeWidth="104"
            d="M311 339.5 C311 339.5 311 470.5 311 601.5 C311 601.5 311 601.5 311 601.5"
          >
            <animate
              attributeName="d"
              dur={DURATION}
              repeatCount="indefinite"
              keyTimes={KEY_TIMES}
              calcMode="spline"
              keySplines={EASE}
              values={values(
                "M311 339.5 C311 339.5 311 470.5 311 601.5 C311 601.5 311 601.5 311 601.5",
                "M311 339.5 C311 339.5 311 470.5 311 601.5 C311 601.5 311 601.5 311 601.5",
                "M328.5 580 C193.2 580 83.5 470.3 83.5 335 C83.5 199.7 193.2 90 328.5 90",
                "M328.5 580 C193.2 580 83.5 470.3 83.5 335 C83.5 199.7 193.2 90 328.5 90",
                "M311 339.5 C311 339.5 311 470.5 311 601.5 C311 601.5 311 601.5 311 601.5",
                "M311 339.5 C311 339.5 311 470.5 311 601.5 C311 601.5 311 601.5 311 601.5",
              )}
            />
          </path>

          <path fill={`url(#${capGradientId})`} d="M259 282c0 28.719 23.281 52 52 52s52-23.281 52-52H259m52 0 52-.001V180H259v101.999z">
            <animate attributeName="opacity" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values="1;1;0;0;1;1" />
          </path>
          <path fill={`url(#${lowerGradientId})`} d="M363 568c0 28.719-23.281 52-52 52s-52-23.281-52-52h104m-52 0c-52 0-52-.001-52-.002V340h104v227.998c0 .001 0 .002-52 .002">
            <animate attributeName="opacity" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values="1;1;0;0;1;1" />
          </path>

          <circle cx="310.5" cy="339.5" r="56.5" fill="#fdfcfd" stroke={`url(#${centerGradientId})`} strokeWidth="24">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("310.5", "310.5", "328.5", "328.5", "310.5", "310.5")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("339.5", "339.5", "90", "90", "339.5", "339.5")} />
          </circle>
          <circle cx="310.5" cy="601.5" r="56.5" fill="#fdfcfd" stroke="#7123f9" strokeWidth="24">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("310.5", "310.5", "328.5", "328.5", "310.5", "310.5")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("601.5", "601.5", "580", "580", "601.5", "601.5")} />
          </circle>
          <circle cx="588.5" cy="68.5" r="56.5" fill="#fdfcfd" stroke="#0264f6" strokeWidth="24">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("588.5", "588.5", "573.5", "573.5", "588.5", "588.5")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("68.5", "68.5", "335", "335", "68.5", "68.5")} />
          </circle>
          <circle cx="68.5" cy="68.5" r="56.5" fill="#fdfcfd" stroke="#016afc" strokeWidth="24">
            <animate attributeName="cx" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("68.5", "68.5", "83.5", "83.5", "68.5", "68.5")} />
            <animate attributeName="cy" dur={DURATION} repeatCount="indefinite" keyTimes={KEY_TIMES} values={values("68.5", "68.5", "335", "335", "68.5", "68.5")} />
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
