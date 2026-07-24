import { memo } from "react";
import { FileText } from "lucide-react";
import type { MarkdownSteerBlock, MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";
import { PlanMdx } from "./PlanMdx";

export const PlanFileReviewPanel = memo(function PlanFileReviewPanel({
  content,
  filePath,
  ready,
  comments,
  onAddComment,
  onRemoveComment,
}: {
  content: string;
  filePath: string;
  ready: boolean;
  comments?: MarkdownSteerCommentsByBlock;
  onAddComment?: (block: MarkdownSteerBlock, text: string) => void;
  onRemoveComment?: (blockId: string, commentId: string) => void;
}) {
  return (
    <aside className="flex h-full min-w-0 flex-1 flex-col bg-surface-deep">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <FileText size={15} className="text-accent" />
        <span className="text-sm font-semibold text-foreground">Plan</span>
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {filePath.split("/").pop() || "plan.mdx"}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-400" : "animate-pulse bg-accent"}`}
          />
          {ready ? "Ready for review" : "Updating live"}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <PlanMdx
            content={content}
            steerable={ready}
            comments={comments}
            onAddComment={onAddComment}
            onRemoveComment={onRemoveComment}
          />
        </div>
      </div>
    </aside>
  );
});
