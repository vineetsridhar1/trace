import { memo } from "react";
import { User, Bot } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTurnField } from "../hooks/useAiConversationSelectors";
import { ForkBranchButton } from "./ForkBranchButton";

interface TurnItemProps {
  turnId: string;
  inherited?: boolean;
  onForked?: (branchId: string) => void;
}

export const TurnItem = memo(function TurnItem({
  turnId,
  inherited = false,
  onForked,
}: TurnItemProps) {
  const role = useTurnField(turnId, "role");
  const content = useTurnField(turnId, "content");
  const isOptimistic = useTurnField(turnId, "_optimistic");

  if (!role || content === undefined) return null;

  const isUser = role === "USER";

  return (
    <div
      className={cn(
        "group/turn relative flex gap-3 px-4 py-3",
        inherited && "opacity-60",
        isOptimistic && "opacity-70",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {isUser ? "You" : "Assistant"}
          </span>
          {inherited && (
            <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
              inherited
            </span>
          )}
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>

      {/* Actions — fork button appears on hover */}
      {!isOptimistic && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5">
          <ForkBranchButton turnId={turnId} onForked={onForked} />
        </div>
      )}
    </div>
  );
});
