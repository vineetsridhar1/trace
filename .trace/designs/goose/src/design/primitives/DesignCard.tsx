import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function DesignCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-design-surface border border-design-border bg-design-surface p-5 text-design-foreground shadow-design-surface",
        className,
      )}
      {...props}
    />
  );
}
