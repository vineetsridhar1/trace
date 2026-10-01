import { ExternalLink, RefreshCw, Send } from "lucide-react";
import type { Review, ReviewSnapshot } from "@trace/gql";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { ReviewView } from "../../stores/review-ui";

interface ReviewHeaderProps {
  review: Review;
  snapshot: ReviewSnapshot;
  snapshots: ReviewSnapshot[];
  view: ReviewView;
  refreshing: boolean;
  onView(view: ReviewView): void;
  onRefresh(): void;
  onSubmit(): void;
  onGeneralComment(): void;
  onSnapshot(snapshotId: string): void;
}

export function ReviewHeader({
  review,
  snapshot,
  snapshots,
  view,
  refreshing,
  onView,
  onRefresh,
  onSubmit,
  onGeneralComment,
  onSnapshot,
}: ReviewHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border bg-surface-deep">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Review: {review.title}</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            PR #{review.pullRequestNumber} · base {snapshot.baseSha.slice(0, 7)}… → head{" "}
            {snapshot.headSha.slice(0, 7)}… · {snapshot.files.length} files
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-background p-0.5">
          {(["changes", "guide"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onView(item)}
              className={cn(
                "rounded-md px-3 py-1 text-xs capitalize",
                view === item ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <select
          aria-label="Review snapshot"
          value={snapshot.id}
          onChange={(event) => onSnapshot(event.target.value)}
          className="max-w-40 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          {[...snapshots]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((candidate, index) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.status === "current" ? "Latest" : `Earlier ${snapshots.length - index}`}{" "}
                · {candidate.headSha.slice(0, 7)}
              </option>
            ))}
        </select>
        <Button size="sm" variant="ghost" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={onGeneralComment}>
          Comment
        </Button>
        <Button size="sm" onClick={onSubmit}>
          <Send size={13} /> Send to GitHub
        </Button>
        <a
          href={review.pullRequestUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Open pull request on GitHub"
        >
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="border-t border-border/60 bg-blue-950/20 px-4 py-1.5 text-[10px] text-blue-200/80">
        Pinned to {snapshot.baseSha.slice(0, 10)}…{snapshot.headSha.slice(0, 10)}. Comments stay in
        Trace until you choose Send to GitHub.
      </div>
    </header>
  );
}
