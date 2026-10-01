import { RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";

export function ReviewEmptyState({
  title,
  description,
  actionLabel,
  tone = "neutral",
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  tone?: "neutral" | "error" | "warning" | "success";
  onAction?(): void;
}) {
  const titleClass = {
    neutral: "text-[#ededef]",
    error: "text-[#fca5a5]",
    warning: "text-[#fcd34d]",
    success: "text-[#6ee7b7]",
  }[tone];
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#141414] p-6">
      <div className="flex max-w-[320px] flex-col gap-1.5">
        <span className={cn("text-sm font-semibold", titleClass)}>{title}</span>
        <span className="text-[12.5px] leading-[1.5] text-muted-foreground">{description}</span>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 flex h-8 w-fit items-center gap-1.5 self-start rounded-[7px] border border-[#262626] px-[11px] text-xs font-medium text-[#d4d4d8] hover:bg-white/5"
          >
            <RefreshCw size={12} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
