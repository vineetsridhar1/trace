import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function DesignScreen({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <main
      className={cn(
        "h-full overflow-auto bg-design-background font-design-body text-design-foreground",
        className,
      )}
      {...props}
    />
  );
}
