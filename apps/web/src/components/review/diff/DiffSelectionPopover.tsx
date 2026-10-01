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
      className="absolute left-1/2 z-[3] flex -translate-x-1/2 items-center gap-0.5 rounded-[9px] border border-[#3a3a40] bg-[#1c1c1f] p-[3px] text-xs font-medium shadow-[0_10px_28px_rgba(0,0,0,.55)]"
    >
      <span className="px-2 font-mono text-[11px] text-muted-foreground">{rangeLabel}</span>
      <button
        type="button"
        onClick={onComment}
        className="flex h-7 items-center gap-1.5 rounded-md bg-[#262626] px-2.5 text-[#ededef] hover:bg-[#2e2e33]"
      >
        <MessageSquare size={11} />
        Comment
      </button>
      <button
        type="button"
        onClick={onAsk}
        className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[#c4b5fd] hover:bg-[#a78bfa]/10"
      >
        <span className="size-1.5 rotate-45 bg-[#a78bfa]" />
        Ask session
      </button>
      <span className="px-2 text-[11px] text-[#71717a]">&#8984;K</span>
    </div>
  );
}
