import { RefreshCw } from "lucide-react";
import type { Review, ReviewSnapshot } from "@trace/gql";
import { cn } from "../../lib/utils";
import type { ReviewView } from "../../stores/review-ui";

interface ReviewHeaderProps {
  review: Review;
  snapshot: ReviewSnapshot;
  view: ReviewView;
  refreshing: boolean;
  pendingThreadCount: number;
  onView(view: ReviewView): void;
  onRefresh(): void;
  onSubmit(): void;
}

export function ReviewHeader({
  review,
  snapshot,
  view,
  refreshing,
  pendingThreadCount,
  onView,
  onRefresh,
  onSubmit,
}: ReviewHeaderProps) {
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-5 border-b border-[#1f1f23] bg-[#141414] px-[18px]">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="shrink-0 font-semibold text-[#8b8b95]">#{review.pullRequestNumber}</span>
        <span className="truncate font-semibold text-[#ededef]">{review.title}</span>
        <span className="shrink-0 text-[#52525b]">&middot;</span>
        <span className="shrink-0 text-[#8b8b95]">
          {snapshot.files.length} file{snapshot.files.length === 1 ? "" : "s"}
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
              view === item ? "text-[#ededef]" : "text-[#8b8b95] hover:text-[#d4d4d8]",
            )}
          >
            {item}
            {view === item ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#ededef]" />
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#8b8b95] hover:bg-white/5 hover:text-[#d4d4d8] disabled:opacity-50"
        aria-label="Refresh review"
        title="Refresh review"
      >
        <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
      </button>
      {pendingThreadCount > 0 ? (
        <button
          type="button"
          onClick={onSubmit}
          className="flex h-9 shrink-0 items-center gap-2 rounded-[8px] bg-gradient-to-b from-[#4d8ff8] to-[#2f6fd8] px-4 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_3px_rgba(0,0,0,.4)]"
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
