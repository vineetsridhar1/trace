import { lazy, memo, Suspense } from "react";
import { FileText } from "lucide-react";
import type { MarkdownSteerBlock, MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";
import { PlanRenderErrorBoundary } from "./PlanRenderErrorBoundary";

const PlanMdx = lazy(() =>
  import("./PlanMdx").then((module) => ({ default: module.PlanMdx })),
);

export const PlanFileReviewPanel = memo(function PlanFileReviewPanel({
  content,
  filePath,
  ready,
  needsCorrection,
  validationErrors,
  comments,
  onAddComment,
  onRemoveComment,
}: {
  content: string;
  filePath: string;
  ready: boolean;
  needsCorrection: boolean;
  validationErrors: string[];
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
            className={`h-1.5 w-1.5 rounded-full ${
              ready
                ? "bg-emerald-400"
                : validationErrors.length > 0
                  ? "bg-amber-400"
                  : "animate-pulse bg-accent"
            }`}
          />
          {ready
            ? "Ready for review"
            : validationErrors.length > 0
              ? needsCorrection
                ? "Needs correction"
                : "Writing plan"
              : "Updating live"}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-5xl">
          {validationErrors.length > 0 ? (
            <div className="my-6 rounded-lg border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold text-foreground">
                {needsCorrection ? "The plan needs a format repair" : "Building visual plan…"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {needsCorrection
                  ? "Use the repair action below the chat to send this back through Plan mode."
                  : "Trace will render the plan as soon as the current MDX write is complete."}
              </p>
              <p className="mt-3 font-mono text-xs text-amber-400">
                {validationErrors[0]}
              </p>
            </div>
          ) : (
            <PlanRenderErrorBoundary key={content}>
              <Suspense
                fallback={
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Loading visual plan…
                  </div>
                }
              >
                <PlanMdx
                  content={content}
                  steerable={ready}
                  comments={comments}
                  onAddComment={onAddComment}
                  onRemoveComment={onRemoveComment}
                />
              </Suspense>
            </PlanRenderErrorBoundary>
          )}
        </div>
      </div>
    </aside>
  );
});
