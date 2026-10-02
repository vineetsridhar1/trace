import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "../ui/button";

export function ReviewInquiryHeader({
  questionCount,
  finished,
  resolved,
  resolving,
  onDelete,
  onResolve,
}: {
  questionCount: number;
  finished: boolean;
  resolved: boolean;
  resolving: boolean;
  onDelete(): void;
  onResolve(): void;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--th-review-edge)] px-4 py-3">
      <Sparkles size={15} aria-hidden="true" className="shrink-0 text-[var(--th-review-comment)]" />
      <h3 className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--th-review-text)]">
        Trace AI · {questionCount} question{questionCount === 1 ? "" : "s"}
      </h3>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete AI conversation"
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={14} />
      </Button>
      {finished ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={resolving}
          onClick={onResolve}
          className="text-[var(--th-review-text-dim)] hover:text-[var(--th-review-text)]"
        >
          {resolved ? "Reopen" : "Resolve"}
        </Button>
      ) : null}
    </header>
  );
}
