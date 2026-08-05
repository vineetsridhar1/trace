import { cn } from "../lib/cn";
import type { ToolShape } from "./toolsData";

const paths: Record<ToolShape, string> = {
  spark: "M9 2.5v13M2.5 9h13M4.4 4.4l9.2 9.2M13.6 4.4l-9.2 9.2",
  prompt: "M3.6 5.4L7.2 9l-3.6 3.6M9.4 12.6h5",
  layers: "M9 2.8l6.2 3.1L9 9 2.8 5.9zM2.8 11.1L9 14.2l6.2-3.1",
  orbit: "M9 3.2a5.8 5.8 0 100 11.6 5.8 5.8 0 000-11.6zM9 7.6a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z",
  chevron: "M3.6 11.4L9 5.4l5.4 6M3.6 15.1h10.8",
  bracket: "M6.6 3.4H3.4v11.2h3.2M11.4 3.4h3.2v11.2h-3.2M9 6.6v4.8",
};

type ToolMarkProps = {
  shape: ToolShape;
  label: string;
  dimmed?: boolean;
  size?: "sm" | "md";
  className?: string;
  "data-trace-id"?: string;
  "data-trace-source"?: string;
};

/**
 * Neutral geometric stand-in per tool. Rows are told apart by letterform-free
 * shape, not by five identical decorative icons.
 */
export function ToolMark({
  shape,
  label,
  dimmed = false,
  size = "md",
  className,
  ...trace
}: ToolMarkProps) {
  return (
    <span
      {...trace}
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-background",
        size === "md" ? "h-9 w-9" : "h-5 w-5 rounded-[5px]",
        dimmed ? "text-design-muted" : "text-design-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        focusable="false"
        className={size === "md" ? "h-[18px] w-[18px]" : "h-3 w-3"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={paths[shape]} />
      </svg>
    </span>
  );
}
