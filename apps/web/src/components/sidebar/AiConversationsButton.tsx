import { BrainCircuit } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";

export function AiConversationsButton() {
  const activePage = useUIStore((s) => s.activePage);
  const setActiveAiConversationId = useUIStore((s) => s.setActiveAiConversationId);

  return (
    <button
      type="button"
      onClick={() => setActiveAiConversationId(null)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        activePage === "ai-conversations"
          ? "bg-accent/15 text-accent"
          : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
      )}
    >
      <BrainCircuit size={16} />
      <span>AI Conversations</span>
    </button>
  );
}
