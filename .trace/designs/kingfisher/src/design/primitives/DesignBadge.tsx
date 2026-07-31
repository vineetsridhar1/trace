import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function DesignBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-design-control border border-design-border bg-design-surface px-2.5 py-1 font-design-body text-xs font-semibold text-design-muted",
        className,
      )}
      {...props}
    />
  );
}
