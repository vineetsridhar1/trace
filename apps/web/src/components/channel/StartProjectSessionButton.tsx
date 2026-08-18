import { useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { createProjectSession } from "../../lib/create-quick-session";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function StartProjectSessionButton({ channelId }: { channelId: string }) {
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      await createProjectSession(channelId);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={starting}
            aria-label="New general session"
            onClick={() => void handleStart()}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:cursor-wait disabled:opacity-60"
          />
        }
      >
        {starting ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
      </TooltipTrigger>
      <TooltipContent>New general session</TooltipContent>
    </Tooltip>
  );
}
