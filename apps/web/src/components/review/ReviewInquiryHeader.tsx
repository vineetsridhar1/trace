import { useEntityField } from "@trace/client-core";
import { Check, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { reviewInquiryAnchor } from "./review-inquiry";

export function ReviewInquiryHeader({
  inquiryId,
  questionCount,
  finished,
  resolved,
  resolving,
  onDelete,
  onResolve,
}: {
  inquiryId: string;
  questionCount: number;
  finished: boolean;
  resolved: boolean;
  resolving: boolean;
  onDelete(): void;
  onResolve(): void;
}) {
  const storedAnchor = useEntityField("reviewInquiries", inquiryId, "anchor");
  const anchor = reviewInquiryAnchor({ anchor: storedAnchor });
  return (
    <header className="flex items-center gap-3 border-b border-[var(--th-review-edge)] px-4 py-3">
      <span
        aria-hidden="true"
        className="size-7 shrink-0 rounded-full bg-radial-[at_30%_25%] from-[var(--th-review-accent-tint)] via-[var(--th-review-comment)] to-[var(--th-review-accent-deep)]"
      />
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-sm font-semibold text-[var(--th-review-text)]">Trace AI</h3>
        <p
          className="m-0 truncate text-[11px] text-[var(--th-review-text-dim)]"
          title={anchor?.filePath}
        >
          {anchor
            ? `${anchor.filePath} · line ${anchor.startLine}${anchor.endLine !== anchor.startLine ? `–${anchor.endLine}` : ""} · `
            : ""}
          {questionCount} question{questionCount === 1 ? "" : "s"}
        </p>
      </div>
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
          variant="outline"
          size="sm"
          disabled={resolving}
          onClick={onResolve}
          className="gap-2 border-[var(--th-review-edge-strong)] bg-transparent text-[var(--th-review-text)]"
        >
          <Check size={14} className="text-[var(--th-review-success-light)]" />
          {resolved ? "Reopen" : "Resolve"}
        </Button>
      ) : null}
    </header>
  );
}
