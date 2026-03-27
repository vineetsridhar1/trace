import { useCallback } from "react";
import { Plus } from "lucide-react";
import { createQuickSession } from "../../lib/create-quick-session";

export function StartSessionDialog({ channelId }: { channelId: string }) {
  const handleClick = useCallback(() => {
    createQuickSession(channelId);
  }, [channelId]);

  return (
    <button
      onClick={handleClick}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
      title="New session (⌘N)"
    >
      <Plus size={16} />
    </button>
  );
}
