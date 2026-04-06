import { memo } from "react";
import { GitBranch } from "lucide-react";
import { cn } from "../../../lib/utils";
import { timeAgo } from "../../../lib/utils";
import { useAiConversationField } from "../hooks/useAiConversationSelectors";

interface ConversationListItemProps {
  id: string;
  isActive: boolean;
  onClick: (id: string) => void;
}

export const ConversationListItem = memo(function ConversationListItem({
  id,
  isActive,
  onClick,
}: ConversationListItemProps) {
  const title = useAiConversationField(id, "title");
  const updatedAt = useAiConversationField(id, "updatedAt");
  const branchCount = useAiConversationField(id, "branchCount");
  const visibility = useAiConversationField(id, "visibility");

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/50 text-foreground",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {title ?? "Untitled conversation"}
          </span>
          {visibility === "PRIVATE" && (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              Private
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {updatedAt && <span>{timeAgo(updatedAt)}</span>}
          {(branchCount ?? 0) > 1 && (
            <span className="flex items-center gap-0.5">
              <GitBranch size={11} />
              {branchCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});
