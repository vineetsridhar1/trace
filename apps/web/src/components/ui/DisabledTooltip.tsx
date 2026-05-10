import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function DisabledTooltip({
  message,
  fullWidth,
  children,
}: {
  message: string | null | undefined;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  if (!message) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex", fullWidth && "w-full")} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{message}</TooltipContent>
    </Tooltip>
  );
}
