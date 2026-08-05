import { ToolMark } from "./ToolMark";
import type { ToolShape } from "./toolsData";

const SOURCE = "src/design/components/SessionTable.tsx";

type SessionRow = {
  id: string;
  name: string;
  type: string;
  shape: ToolShape;
  author: string;
  initials: string;
  updated: string;
};

const rows: SessionRow[] = [
  {
    id: "s1",
    name: "Refactor auth token refresh",
    type: "Claude Code",
    shape: "spark",
    author: "Vineet Sridhar",
    initials: "VS",
    updated: "12m ago",
  },
  {
    id: "s2",
    name: "Coding tool readiness designs",
    type: "Design",
    shape: "layers",
    author: "Trace Design Agent",
    initials: "TD",
    updated: "23h ago",
  },
  {
    id: "s3",
    name: "Port payments webhook",
    type: "Codex",
    shape: "prompt",
    author: "Vineet Sridhar",
    initials: "VS",
    updated: "1d ago",
  },
  {
    id: "s4",
    name: "Trim worker pool cold start",
    type: "Pi",
    shape: "orbit",
    author: "Ana Ruiz",
    initials: "AR",
    updated: "1d ago",
  },
  {
    id: "s5",
    name: "Review the visual implementation plan",
    type: "Claude Code",
    shape: "spark",
    author: "Vineet Sridhar",
    initials: "VS",
    updated: "2d ago",
  },
  {
    id: "s6",
    name: "Inbox triage rules",
    type: "Codex",
    shape: "prompt",
    author: "Ana Ruiz",
    initials: "AR",
    updated: "3d ago",
  },
];

export function SessionTable() {
  return (
    <div data-trace-id="session-table" data-trace-source={SOURCE} className="px-6 py-4">
      <div
        data-trace-id="session-table-head"
        data-trace-source={SOURCE}
        className="flex items-center gap-4 border-b border-design-border px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-design-muted"
      >
        <span className="min-w-0 flex-1">Name</span>
        <span className="w-[132px] shrink-0">Type</span>
        <span className="w-[152px] shrink-0">Created by</span>
        <span className="w-[110px] shrink-0 text-right">Last message</span>
      </div>
      <p
        data-trace-id="session-group-inprogress"
        data-trace-source={SOURCE}
        className="flex items-center gap-2 px-2 pb-1 pt-3 text-[13px] font-semibold text-design-foreground"
      >
        <span aria-hidden="true" className="text-[10px] text-design-muted">
          ▼
        </span>
        In Progress
        <span className="font-normal text-design-muted">6</span>
      </p>
      <ul data-trace-id="session-rows" data-trace-source={SOURCE}>
        {rows.map((row) => (
          <li key={row.id}>
            <a
              href={`#session-${row.id}`}
              data-trace-id={`session-row-${row.id}`}
              data-trace-source={SOURCE}
              className="flex items-center gap-4 rounded-design-control px-2 py-2.5 transition duration-design ease-design hover:bg-design-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-design-secondary"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-design-secondary"
                />
                <span className="truncate text-[13px] text-design-foreground">{row.name}</span>
              </span>
              <span className="flex w-[132px] shrink-0 items-center gap-2">
                <ToolMark shape={row.shape} label={row.type} dimmed size="sm" />
                <span className="truncate text-xs text-design-muted">{row.type}</span>
              </span>
              <span className="flex w-[152px] shrink-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-design-border text-[9px] font-semibold text-design-muted"
                >
                  {row.initials}
                </span>
                <span className="truncate text-xs text-design-muted">{row.author}</span>
              </span>
              <span className="w-[110px] shrink-0 text-right text-xs text-design-muted">
                {row.updated}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
