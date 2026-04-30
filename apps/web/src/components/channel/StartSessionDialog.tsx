import { useCallback } from "react";
import { Plus } from "lucide-react";
import { createQuickSession } from "../../lib/create-quick-session";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const handleClick = useCallback(() => {
    createQuickSession(channelId);
  }, [channelId]);

  const tooltip = "New session (⌘N)";

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <button
            onClick={handleClick}
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            )}
            title={tooltip}
            aria-label={tooltip}
          >
            <Plus size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}
