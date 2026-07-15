import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const columnClasses = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
} as const;

type DesignGridProps = HTMLAttributes<HTMLDivElement> & { columns?: keyof typeof columnClasses };

export function DesignGrid({ columns = 2, className, ...props }: DesignGridProps) {
  return <div className={cn("grid gap-design", columnClasses[columns], className)} {...props} />;
}
