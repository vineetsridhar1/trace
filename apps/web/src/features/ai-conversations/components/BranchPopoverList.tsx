import { useCallback } from "react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchField } from "../hooks/useAiConversationSelectors";
import { getBranchDisplayLabel } from "../utils/branchLabel";
import { useAiConversationUIStore } from "../store/ai-conversation-ui";

// ── Single branch row ──────────────────────────────────────────

interface BranchRowProps {
  branchId: string;
  conversationId: string;
  onSelect: () => void;
}

function BranchRow({ branchId, conversationId, onSelect }: BranchRowProps) {
  const label = useBranchField(branchId, "label");
  const depth = useBranchField(branchId, "depth");
  const turnCount = useBranchField(branchId, "turnCount");
  const createdAt = useBranchField(branchId, "createdAt");
  const setActiveBranch = useAiConversationUIStore((s) => s.setActiveBranch);

  const handleClick = useCallback(() => {
    setActiveBranch(conversationId, branchId);
    onSelect();
  }, [setActiveBranch, conversationId, branchId, onSelect]);

  const displayLabel = getBranchDisplayLabel({
    label: label ?? null,
    depth: depth ?? 0,
  });

  const timeLabel = createdAt
    ? new Date(createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
        "hover:bg-accent/50 transition-colors cursor-pointer",
      )}
    >
      <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-foreground">
          {displayLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {turnCount != null
            ? `${turnCount} turn${turnCount === 1 ? "" : "s"}`
            : ""}
          {timeLabel ? ` · ${timeLabel}` : ""}
        </span>
      </div>
    </button>
  );
}

// ── List ───────────────────────────────────────────────────────

interface BranchPopoverListProps {
  childBranchIds: string[];
  conversationId: string;
  onSelect: () => void;
}

export function BranchPopoverList({
  childBranchIds,
  conversationId,
  onSelect,
}: BranchPopoverListProps) {
  return (
    <>
      <div className="mb-1 px-2.5 pt-1 text-xs font-medium text-muted-foreground">
        Branches from this turn
      </div>
      <div className="flex flex-col gap-0.5">
        {childBranchIds.map((branchId) => (
          <BranchRow
            key={branchId}
            branchId={branchId}
            conversationId={conversationId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}
