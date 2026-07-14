import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const gapClasses = {
  1: "gap-[calc(var(--design-space)*1)]",
  2: "gap-[calc(var(--design-space)*2)]",
  3: "gap-[calc(var(--design-space)*3)]",
  4: "gap-[calc(var(--design-space)*4)]",
  6: "gap-[calc(var(--design-space)*6)]",
  8: "gap-[calc(var(--design-space)*8)]",
} as const;

type DesignStackProps = HTMLAttributes<HTMLDivElement> & {
  direction?: "row" | "column";
  gap?: keyof typeof gapClasses;
};

export function DesignStack({
  direction = "column",
  gap = 4,
  className,
  ...props
}: DesignStackProps) {
  return (
    <div
      className={cn(
        "flex",
        direction === "column" ? "flex-col" : "flex-row",
        gapClasses[gap],
        className,
      )}
      {...props}
    />
  );
}
