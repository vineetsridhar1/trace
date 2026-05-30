import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function ActionTooltip({
  label,
  children,
  className,
  contentClassName,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex", className)} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent className={contentClassName}>{label}</TooltipContent>
    </Tooltip>
  );
}
