import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  added: { label: "NEW", className: "bg-[#34d399]/12 text-[#34d399]" },
  removed: { label: "DELETED", className: "bg-[#f87171]/12 text-[#f87171]" },
  renamed: { label: "RENAMED", className: "bg-[#60a5fa]/12 text-[#93c5fd]" },
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
        "sticky top-[-16px] z-[2] flex h-10 items-center gap-2.5 border-b border-[#232326] bg-[#171717] px-3.5",
        collapsed && "border-b-transparent",
      )}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="text-[#5c5c66] transition-colors hover:text-foreground"
        aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </button>
      <span className="min-w-0 truncate font-mono text-[12.5px] text-muted-foreground">
        {directory}
        <span className="font-medium text-[#ededef]">{name}</span>
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
      <span className="ml-auto shrink-0 font-mono text-[11.5px] font-medium">
        <span className="text-[#34d399]">+{additions}</span>{" "}
        <span className="text-[#f87171]">&minus;{deletions}</span>
      </span>
      {threadCount > 0 ? (
        <span className="shrink-0 text-[11.5px] font-medium text-[#93c5fd]">
          {threadCount} thread{threadCount === 1 ? "" : "s"}
        </span>
      ) : null}
    </header>
  );
}
