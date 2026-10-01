import { ExternalLink, RefreshCw } from "lucide-react";
import type { Review, ReviewSnapshot } from "@trace/gql";
import { cn } from "../../lib/utils";
import type { ReviewView } from "../../stores/review-ui";

interface ReviewHeaderProps {
  review: Review;
  snapshot: ReviewSnapshot;
  view: ReviewView;
  refreshing: boolean;
  selectedThreadCount: number;
  onView(view: ReviewView): void;
  onRefresh(): void;
  onSubmit(): void;
}

export function ReviewHeader({
  review,
  snapshot,
  view,
  refreshing,
  selectedThreadCount,
  onView,
  onRefresh,
  onSubmit,
}: ReviewHeaderProps) {
  const metadata = snapshot.providerMetadata as { baseRef?: unknown; headRef?: unknown };
  const headRef = typeof metadata.headRef === "string" ? metadata.headRef : null;
  const baseRef = typeof metadata.baseRef === "string" ? metadata.baseRef : null;
  const subtitle = [
    `#${review.pullRequestNumber}`,
    headRef && baseRef
      ? `${headRef} → ${baseRef}`
      : `${snapshot.baseSha.slice(0, 7)} → ${snapshot.headSha.slice(0, 7)}`,
    `${snapshot.files.length} file${snapshot.files.length === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[#1f1f23] bg-[#141414] px-[18px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-sm font-semibold text-[#ededef]">{review.title}</span>
        <span className="truncate text-[11.5px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid shrink-0 grid-cols-2 rounded-[7px] border border-[#1f1f23] bg-[#0a0a0a] p-0.5 text-xs font-medium">
        {(["changes", "guide"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onView(item)}
            aria-pressed={view === item}
            className={cn(
              "rounded-[5px] px-3 py-[5px] capitalize",
              view === item ? "bg-[#262626] text-[#ededef]" : "text-muted-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-[7px] border border-[#262626] px-2.5 text-xs font-medium text-[#d4d4d8] hover:bg-white/5 disabled:opacity-50"
      >
        <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
        Refresh
      </button>
      <button
        type="button"
        onClick={onSubmit}
        className="flex h-[30px] shrink-0 items-center gap-2 rounded-[7px] bg-gradient-to-b from-[#4d8ff8] to-[#2f6fd8] px-[13px] text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_3px_rgba(0,0,0,.4)]"
      >
        Send to GitHub
        {selectedThreadCount > 0 ? (
          <span className="rounded-[9px] bg-white/20 px-1.5 text-[10.5px]">
            {selectedThreadCount}
          </span>
        ) : null}
      </button>
      <a
        href={review.pullRequestUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Open pull request on GitHub"
      >
        <ExternalLink size={14} />
      </a>
    </header>
  );
}
