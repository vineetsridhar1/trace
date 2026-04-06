import { useState, useCallback } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchSummary } from "../hooks/useAiConversationSelectors";

interface SummaryNodeProps {
  summaryId: string;
  branchId: string;
  summarizedTurnCount: number;
}

export function SummaryNode({
  summaryId,
  branchId,
  summarizedTurnCount,
}: SummaryNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = useBranchSummary(branchId);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (!summary) return null;

  return (
    <div className="my-2">
      <button
        onClick={toggle}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 rounded-lg",
          "text-sm text-muted-foreground",
          "bg-muted/30 hover:bg-muted/50 transition-colors",
          "border border-border/50",
        )}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <FileText className="h-4 w-4 shrink-0" />
        <span>
          {summarizedTurnCount} turn{summarizedTurnCount !== 1 ? "s" : ""} summarized
        </span>
      </button>

      {expanded && (
        <div
          className={cn(
            "mt-1 px-4 py-3 rounded-lg",
            "text-sm text-foreground/80",
            "bg-muted/20 border border-border/30",
            "whitespace-pre-wrap",
          )}
        >
          {summary.content}
        </div>
      )}
    </div>
  );
}
