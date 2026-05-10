import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function DisabledReasonHint({
  message,
  children,
}: {
  message: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="flex items-center gap-0.5 text-xs text-amber-500" />}
      >
        <AlertTriangle size={10} />
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{message}</TooltipContent>
    </Tooltip>
  );
}
