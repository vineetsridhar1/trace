import { Lock } from "lucide-react";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const PRIVATE_SESSION_TOOLTIP = "This session is private and only visible by you";

export function PrivateSessionLock({
  className,
  iconClassName,
  size = 14,
}: {
  className?: string;
  iconClassName?: string;
  size?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn("inline-flex shrink-0 items-center justify-center", className)}
            aria-label="Private session"
          />
        }
      >
        <Lock size={size} className={iconClassName} />
      </TooltipTrigger>
      <TooltipContent>{PRIVATE_SESSION_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}
