import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";
import { LARGE_DIFF_LINE_THRESHOLD } from "../review-diff-policy";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  added: { label: "NEW", className: "bg-[var(--th-success)]/12 text-[var(--th-success)]" },
  removed: { label: "DELETED", className: "bg-[var(--destructive)]/12 text-[var(--destructive)]" },
  renamed: {
    label: "RENAMED",
    className: "bg-[var(--th-accent-light)]/12 text-[var(--th-review-comment)]",
  },
};

export function DiffFileHeader({
  filePath,
  status,
  additions,
  deletions,
  threadCount,
  collapsed,
  onToggleCollapsed,
}: {
  filePath: string;
  status: string;
  additions: number;
  deletions: number;
  threadCount: number;
  collapsed: boolean;
  onToggleCollapsed(): void;
}) {
  const lastSlash = filePath.lastIndexOf("/");
  const directory = lastSlash === -1 ? "" : filePath.slice(0, lastSlash + 1);
  const name = filePath.slice(lastSlash + 1);
  const badge = STATUS_BADGE[status];
  return (
    <header
      className={cn(
        "sticky top-0 z-[2] flex h-10 items-center gap-2.5 border-b border-[var(--th-review-card-edge)] bg-[var(--th-surface)] px-3.5",
        collapsed && "border-b-transparent",
      )}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="text-[var(--th-review-text-ghost)] transition-colors hover:text-foreground"
        aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </button>
      <span className="min-w-0 truncate font-mono text-[12.5px] text-muted-foreground">
        {directory}
        <span className="font-medium text-[var(--th-review-text)]">{name}</span>
      </span>
      {badge ? (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.06em]",
            badge.className,
          )}
        >
          {badge.label}
        </span>
      ) : null}
      {collapsed && additions + deletions >= LARGE_DIFF_LINE_THRESHOLD ? (
        <span
          className="min-w-0 truncate text-xs text-muted-foreground"
          title="Large diff · collapsed by default"
        >
          Large diff · collapsed by default
        </span>
      ) : null}
      <span className="ml-auto shrink-0 font-mono text-[11.5px] font-medium">
        <span className="text-[var(--th-success)]">+{additions}</span>{" "}
        <span className="text-[var(--destructive)]">&minus;{deletions}</span>
      </span>
      {threadCount > 0 ? (
        <span className="shrink-0 text-[11.5px] font-medium text-[var(--th-review-comment)]">
          {threadCount} thread{threadCount === 1 ? "" : "s"}
        </span>
      ) : null}
    </header>
  );
}
