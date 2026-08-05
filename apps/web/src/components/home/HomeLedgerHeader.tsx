import type { HomeWorkBucket } from "./home-work-data";

export function HomeLedgerHeader({
  bucket,
  count,
  onInbox,
}: {
  bucket: HomeWorkBucket;
  count: number;
  onInbox: () => void;
}) {
  const label =
    bucket === "in_progress" ? "In progress" : bucket === "needs_you" ? "Needs you" : "Done today";
  const dot =
    bucket === "in_progress"
      ? "home-status-pulse bg-[var(--th-accent)]"
      : bucket === "needs_you"
        ? "bg-[var(--th-warn)]"
        : "bg-[var(--th-success)]";
  return (
    <div className="flex h-8 items-center gap-2 bg-[var(--th-raised)] px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--th-muted)]">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
      <span className="text-[10px] font-normal tracking-normal text-[var(--th-faint)]">
        {count}
      </span>
      {bucket === "needs_you" && (
        <button
          type="button"
          onClick={onInbox}
          className="ml-auto text-[11px] font-normal normal-case tracking-normal text-[var(--th-faint)] hover:text-foreground"
        >
          Inbox →
        </button>
      )}
    </div>
  );
}
