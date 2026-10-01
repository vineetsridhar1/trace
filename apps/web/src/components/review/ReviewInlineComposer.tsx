import { MessageSquare, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import type { ReviewLineSelection } from "./review-selection";

export interface ReviewComposerTarget {
  kind: "comment" | "ask";
  scope: "line" | "file" | "guide_explanation";
  /** Where the comment will land, shown next to the title. */
  label: string;
  anchor?: ReviewLineSelection;
  guideChapterId?: string;
}

export function ReviewInlineComposer({
  target,
  body,
  submitting,
  onBody,
  onCancel,
  onSubmit,
}: {
  target: ReviewComposerTarget;
  body: string;
  submitting: boolean;
  onBody(value: string): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const comment = target.kind === "comment";
  return (
    <div className="absolute bottom-4 left-1/2 z-30 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-[var(--th-review-edge-strong)] bg-[var(--th-raised)] p-3 shadow-[0_20px_50px_rgba(0,0,0,.6)]">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        {comment ? (
          <MessageSquare size={12} className="text-[var(--th-review-comment)]" />
        ) : (
          <Sparkles size={12} className="text-[var(--th-review-ai-light)]" />
        )}
        <span className="text-[var(--th-review-text)]">
          {comment ? "Comment for team" : "Ask session"}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{target.label}</span>
      </div>
      <textarea
        autoFocus
        value={body}
        onChange={(event) => onBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSubmit();
        }}
        className="h-20 w-full resize-none rounded-md border border-[var(--th-edge)] bg-[var(--th-surface-mid)] p-2 text-sm outline-none focus:border-[var(--th-accent)]"
        placeholder={
          comment
            ? "Stays in Trace until you send it…"
            : target.scope === "guide_explanation"
              ? "Ask about this chapter…"
              : "Ask about these lines…"
        }
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-muted-foreground">
          {comment ? "Private until you send to GitHub" : "Runs in the Review Chat queue"}
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!body.trim() || submitting} onClick={onSubmit}>
          {comment ? "Save in Trace" : "Queue question"}
        </Button>
      </div>
    </div>
  );
}
