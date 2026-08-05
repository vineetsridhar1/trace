import { useState } from "react";
import { cn } from "../lib/cn";
import { ToolMark } from "./ToolMark";
import { availableTools, installedTools, type Tool, type ToolState } from "./toolsData";

const SOURCE = "src/design/components/ToolTable.tsx";

const statusMeta: Record<ToolState, { glyph: string; label: string; tone: string }> = {
  update: { glyph: "↑", label: "Update available", tone: "text-design-warning" },
  current: { glyph: "✓", label: "Up to date", tone: "text-design-success" },
  missing: { glyph: "+", label: "Not installed", tone: "text-design-muted" },
  updating: { glyph: "◐", label: "Updating", tone: "text-design-secondary" },
  installing: { glyph: "◐", label: "Installing", tone: "text-design-secondary" },
  updated: { glyph: "✓", label: "Updated", tone: "text-design-success" },
  installed: { glyph: "✓", label: "Installed", tone: "text-design-success" },
  failed: { glyph: "!", label: "Update failed", tone: "text-design-danger" },
  queued: { glyph: "•", label: "Queued", tone: "text-design-muted" },
};

const installDetail: Record<string, { path: string; source: string; installed: string }> = {
  "claude-code": {
    path: "/opt/homebrew/bin/claude",
    source: "npm · @anthropic-ai/claude-code",
    installed: "Installed 3 days ago",
  },
  codex: {
    path: "/opt/homebrew/bin/codex",
    source: "npm · @openai/codex",
    installed: "Installed 11 days ago",
  },
  pi: {
    path: "/Users/vineet/.local/bin/pi",
    source: "curl · get.pi.dev",
    installed: "Installed 2 days ago",
  },
};

function ColumnHeads() {
  return (
    <div
      data-trace-id="tool-table-head"
      data-trace-source={SOURCE}
      className="flex items-center gap-4 border-b border-design-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-design-muted"
    >
      <span className="min-w-0 flex-1">Tool</span>
      <span className="w-[90px] shrink-0">Size</span>
      <span className="w-[150px] shrink-0">Version</span>
      <span className="w-[150px] shrink-0">Status</span>
      <span className="w-[104px] shrink-0 text-right">Action</span>
    </div>
  );
}

function ActionCell({ tool }: { tool: Tool }) {
  const label =
    tool.state === "update"
      ? "Update"
      : tool.state === "missing"
        ? "Install"
        : tool.state === "failed"
          ? "Retry"
          : tool.state === "updating" || tool.state === "installing" || tool.state === "queued"
            ? "Cancel"
            : null;

  if (!label) {
    return (
      <span
        aria-label="No action needed"
        className="w-[104px] shrink-0 text-right text-xs text-design-muted"
      >
        <span aria-hidden="true">—</span>
      </span>
    );
  }

  return (
    <span className="flex w-[104px] shrink-0 justify-end">
      <button
        type="button"
        data-trace-id={`tool-table-${tool.id}-action`}
        data-trace-source={SOURCE}
        className="inline-flex h-8 items-center rounded-design-control border border-design-border bg-design-surface px-3 text-[13px] font-semibold text-design-foreground transition duration-design ease-design hover:border-design-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
      >
        {label}
      </button>
    </span>
  );
}

function DetailPanel({ tool }: { tool: Tool }) {
  const detail = installDetail[tool.id];
  if (!detail) return null;

  return (
    <div
      data-trace-id={`tool-table-${tool.id}-detail`}
      data-trace-source={SOURCE}
      className="border-t border-design-border bg-design-surface px-4 py-3.5 pl-[64px]"
    >
      <dl className="flex flex-wrap gap-x-10 gap-y-2.5">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-muted">
            Install path
          </dt>
          <dd className="mt-0.5 font-design-mono text-xs text-design-foreground">{detail.path}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-muted">
            Source
          </dt>
          <dd className="mt-0.5 font-design-mono text-xs text-design-foreground">
            {detail.source}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-muted">
            Powers
          </dt>
          <dd className="mt-0.5 text-xs text-design-foreground">{tool.sessionType}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-muted">
            History
          </dt>
          <dd className="mt-0.5 text-xs text-design-foreground">
            {detail.installed} · {tool.size}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center gap-4">
        <a
          href="#release-notes"
          data-trace-id={`tool-table-${tool.id}-release-notes`}
          data-trace-source={SOURCE}
          className="text-xs font-semibold text-design-secondary underline-offset-2 hover:underline"
        >
          Release notes for {tool.latest}
        </a>
        <button
          type="button"
          data-trace-id={`tool-table-${tool.id}-reinstall`}
          data-trace-source={SOURCE}
          className="text-xs font-semibold text-design-muted transition duration-design ease-design hover:text-design-foreground"
        >
          Reinstall
        </button>
        <button
          type="button"
          data-trace-id={`tool-table-${tool.id}-remove`}
          data-trace-source={SOURCE}
          className="text-xs font-semibold text-design-danger underline-offset-2 hover:underline"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function TableRow({
  tool,
  expanded,
  onToggle,
}: {
  tool: Tool;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = statusMeta[tool.state];
  const dimmed = tool.state === "missing";
  const inFlight = tool.state === "updating" || tool.state === "installing";

  return (
    <div data-trace-id={`tool-table-row-${tool.id}`} data-trace-source={SOURCE}>
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          data-trace-id={`tool-table-${tool.id}-expand`}
          data-trace-source={SOURCE}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-design-control text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
        >
          <span
            aria-hidden="true"
            className={cn(
              "w-2 shrink-0 text-[10px] text-design-muted transition duration-design ease-design",
              expanded && "rotate-90",
            )}
          >
            ▶
          </span>
          <ToolMark shape={tool.shape} label={tool.name} dimmed={dimmed} />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-design-foreground">
                {tool.name}
              </span>
              {tool.pinned ? (
                <span className="shrink-0 rounded-[4px] border border-design-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] text-design-muted">
                  Primary
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate font-design-mono text-xs text-design-muted">
              {tool.command}
            </span>
          </span>
        </button>
        <span className="w-[90px] shrink-0 font-design-mono text-xs text-design-muted">
          {tool.size}
        </span>
        <span className="w-[150px] shrink-0 font-design-mono text-xs">
          {tool.state === "update" || tool.state === "updating" ? (
            <>
              <span className="text-design-muted">{tool.version}</span>
              <span aria-hidden="true" className="text-design-muted">
                {" → "}
              </span>
              <span className="text-design-foreground">{tool.latest}</span>
            </>
          ) : (
            <span className="text-design-muted">{tool.version ?? `${tool.latest} available`}</span>
          )}
        </span>
        <span className="w-[150px] shrink-0">
          <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.tone)}>
            <span aria-hidden="true" className="leading-none">
              {meta.glyph}
            </span>
            {inFlight ? `${meta.label} ${tool.progress ?? 0}%` : meta.label}
          </span>
          {inFlight ? (
            <span
              role="progressbar"
              aria-label={`${tool.name} progress`}
              aria-valuenow={tool.progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              data-trace-id={`tool-table-${tool.id}-progress`}
              data-trace-source={SOURCE}
              className="mt-1.5 block h-1 w-[132px] overflow-hidden rounded-full bg-design-border"
            >
              <span
                className="block h-full rounded-full bg-design-secondary"
                style={{ width: `${tool.progress ?? 0}%` }}
              />
            </span>
          ) : null}
        </span>
        <ActionCell tool={tool} />
      </div>
      {tool.state === "failed" && tool.detail ? (
        <p
          data-trace-id={`tool-table-${tool.id}-error`}
          data-trace-source={SOURCE}
          className="border-t border-design-border px-4 py-2.5 pl-[64px] text-xs leading-5 text-design-foreground"
          style={{
            backgroundColor: "color-mix(in srgb, var(--design-color-danger) 10%, transparent)",
          }}
        >
          <span aria-hidden="true" className="mr-1.5 font-semibold text-design-danger">
            !
          </span>
          {tool.detail}{" "}
          <a
            href="#install-log"
            data-trace-id={`tool-table-${tool.id}-log`}
            data-trace-source={SOURCE}
            className="font-semibold text-design-secondary underline-offset-2 hover:underline"
          >
            View install log
          </a>
        </p>
      ) : null}
      {expanded ? <DetailPanel tool={tool} /> : null}
    </div>
  );
}

type ToolTableProps = {
  tools?: Tool[];
  available?: Tool[];
  accordionOpen?: boolean;
  expandedId?: string | null;
};

export function ToolTable({
  tools = installedTools,
  available = availableTools,
  accordionOpen = false,
  expandedId = null,
}: ToolTableProps) {
  const [open, setOpen] = useState(accordionOpen);
  const [expanded, setExpanded] = useState<string | null>(expandedId);

  return (
    <div data-trace-id="tool-table" data-trace-source={SOURCE} className="space-y-3">
      <div className="overflow-hidden rounded-design-surface border border-design-border bg-design-background">
        <ColumnHeads />
        <div className="divide-y divide-design-border">
          {tools.map((tool) => (
            <TableRow
              key={tool.id}
              tool={tool}
              expanded={expanded === tool.id}
              onToggle={() => setExpanded((value) => (value === tool.id ? null : tool.id))}
            />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-design-surface border border-design-border bg-design-background">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          data-trace-id="tool-table-accordion-trigger"
          data-trace-source={SOURCE}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition duration-design ease-design hover:bg-design-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-design-secondary"
        >
          <span
            aria-hidden="true"
            className={cn(
              "w-2 shrink-0 text-[10px] text-design-muted transition duration-design ease-design",
              open && "rotate-90",
            )}
          >
            ▶
          </span>
          <span className="flex-1 text-[13px] font-semibold text-design-foreground">
            Available to install
          </span>
          <span className="text-xs text-design-muted">
            Not on this computer — installing one unlocks its session type
          </span>
          <span className="rounded-full border border-design-border px-2 py-0.5 text-[11px] font-semibold text-design-muted">
            {available.length}
          </span>
        </button>
        {open ? (
          <div className="divide-y divide-design-border border-t border-design-border">
            {available.map((tool) => (
              <TableRow
                key={tool.id}
                tool={tool}
                expanded={expanded === tool.id}
                onToggle={() => setExpanded((value) => (value === tool.id ? null : tool.id))}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
