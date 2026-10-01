import { Bot, MoreHorizontal, RefreshCw } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import type { ReviewView } from "../../stores/review-ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface ReviewHeaderProps {
  reviewId: string;
  fileCount: number;
  view: ReviewView;
  refreshing: boolean;
  pendingThreadCount: number;
  onView(view: ReviewView): void;
  onRefresh(): void;
  onSubmit(): void;
  onOpenAttachedSession(): void;
}

export function ReviewHeader({
  reviewId,
  fileCount,
  view,
  refreshing,
  pendingThreadCount,
  onView,
  onRefresh,
  onSubmit,
  onOpenAttachedSession,
}: ReviewHeaderProps) {
  const pullRequestNumber = useEntityField("reviews", reviewId, "pullRequestNumber");
  const title = useEntityField("reviews", reviewId, "title");
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-5 border-b border-[var(--th-edge-faint)] bg-[var(--th-review-canvas)] px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="shrink-0 font-semibold text-[var(--th-review-text-dim)]">
          #{pullRequestNumber}
        </span>
        <span className="truncate font-semibold text-[var(--th-review-text)]">{title}</span>
        <span className="shrink-0 text-[var(--th-faint)]">&middot;</span>
        <span className="shrink-0 text-[var(--th-review-text-dim)]">
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex h-full shrink-0 items-center gap-7 text-[13px] font-semibold">
        {(["changes", "guide"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onView(item)}
            aria-pressed={view === item}
            className={cn(
              "relative flex h-full items-center capitalize",
              view === item
                ? "text-[var(--th-review-text)]"
                : "text-[var(--th-review-text-dim)] hover:text-[var(--th-heading)]",
            )}
          >
            {item}
            {view === item ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--th-review-text)]" />
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--th-review-text-dim)] hover:bg-white/5 hover:text-[var(--th-heading)] disabled:opacity-50"
        aria-label="Refresh review"
        title="Refresh review"
      >
        <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--th-review-text-dim)] outline-none hover:bg-white/5 hover:text-[var(--th-heading)] data-popup-open:bg-white/5"
          aria-label="Review options"
          title="Review options"
        >
          <MoreHorizontal size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onOpenAttachedSession}>
            <Bot /> Open agent session
            <span className="ml-auto text-[10px] text-muted-foreground">Debug</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {pendingThreadCount > 0 ? (
        <button
          type="button"
          onClick={onSubmit}
          className="flex h-8 shrink-0 items-center gap-2 rounded-[8px] bg-gradient-to-b from-[var(--th-review-accent-bright)] to-[var(--th-review-accent-deep)] px-3.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_3px_rgba(0,0,0,.4)]"
        >
          Send to GitHub
          <span className="rounded-[9px] bg-white/20 px-1.5 text-[10.5px]">
            {pendingThreadCount}
          </span>
        </button>
      ) : null}
    </header>
  );
}
