import { MessageSquare } from "lucide-react";

export function DiffSelectionPopover({
  rangeLabel,
  top,
  onComment,
  onAsk,
}: {
  rangeLabel: string;
  top: number;
  onComment(): void;
  onAsk(): void;
}) {
  return (
    <div
      data-review-selection-popover
      style={{ top }}
      className="absolute left-1/2 z-[3] flex -translate-x-1/2 items-center gap-0.5 rounded-[9px] border border-[var(--th-review-edge-strong)] bg-[var(--th-raised)] p-[3px] text-xs font-medium shadow-[0_10px_28px_rgba(0,0,0,.55)]"
    >
      <span className="px-2 font-mono text-[11px] text-muted-foreground">{rangeLabel}</span>
      <button
        type="button"
        onClick={onComment}
        className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--th-edge)] px-2.5 text-[var(--th-review-text)] hover:bg-[var(--th-edge-strong)]"
      >
        <MessageSquare size={11} />
        Comment
      </button>
      <button
        type="button"
        onClick={onAsk}
        className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[var(--th-review-ai-light)] hover:bg-[var(--th-review-ai)]/10"
      >
        <span className="size-1.5 rotate-45 bg-[var(--th-review-ai)]" />
        Ask session
      </button>
      <span className="px-2 text-[11px] text-[var(--th-review-text-faint)]">&#8984;K</span>
    </div>
  );
}
