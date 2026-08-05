import { cn } from "../lib/cn";
import { ToolMark } from "./ToolMark";
import {
  everythingReady,
  failedTools,
  installedTools,
  pinnedMissingTools,
  updatedTools,
  updatingTools,
  type Tool,
} from "./toolsData";

const SOURCE = "src/design/components/ToolsPopover.tsx";

export type PopoverState = "updates" | "updating" | "updated" | "failed" | "ready" | "missing";

type PopoverCopy = {
  glyph: string;
  tone: string;
  status: string;
  tools: Tool[];
  /** One line of context under the list. Optional by design: most states need none. */
  note?: string;
  noteTone?: "muted" | "danger";
  action: { label: string; intent: "primary" | "secondary" };
  /** Only shown where absent tools are worth mentioning at all. */
  showAvailable: boolean;
  settingsLabel: string;
  showCheck: boolean;
};

/** Codex absent but still first class, per the top-level rule for primary tools. */
const codexMissing = pinnedMissingTools.filter((tool) => tool.state === "missing");

const copyByState: Record<PopoverState, PopoverCopy> = {
  updates: {
    glyph: "↑",
    tone: "text-design-warning",
    status: "2 updates available",
    tools: installedTools.filter((tool) => tool.state === "update"),
    note: "Sessions keep working on your current versions.",
    noteTone: "muted",
    action: { label: "Update all (2)", intent: "primary" },
    showAvailable: true,
    settingsLabel: "Manage in Settings",
    showCheck: true,
  },
  updating: {
    glyph: "◐",
    tone: "text-design-secondary",
    status: "Updating 2 tools",
    tools: updatingTools.filter((tool) => tool.state !== "current"),
    note: "You can keep working. Running sessions finish on their current version.",
    noteTone: "muted",
    action: { label: "Cancel all", intent: "secondary" },
    showAvailable: false,
    settingsLabel: "Manage in Settings",
    showCheck: false,
  },
  updated: {
    glyph: "✓",
    tone: "text-design-success",
    status: "2 tools updated",
    tools: updatedTools.filter((tool) => tool.state === "updated"),
    note: "Sessions already running finish on their old version.",
    noteTone: "muted",
    action: { label: "Done", intent: "secondary" },
    showAvailable: false,
    settingsLabel: "See what changed in Settings",
    showCheck: false,
  },
  failed: {
    glyph: "!",
    tone: "text-design-danger",
    status: "1 update failed",
    tools: failedTools.filter((tool) => tool.state !== "current"),
    note: "Codex could not download — the registry returned 503.",
    noteTone: "danger",
    action: { label: "Retry Codex", intent: "primary" },
    showAvailable: false,
    settingsLabel: "See the full log in Settings",
    showCheck: false,
  },
  ready: {
    glyph: "✓",
    tone: "text-design-success",
    status: "All 3 tools up to date",
    tools: everythingReady,
    action: { label: "Check for updates", intent: "secondary" },
    showAvailable: true,
    settingsLabel: "Manage in Settings",
    showCheck: false,
  },
  missing: {
    glyph: "+",
    tone: "text-design-warning",
    status: "Codex is not installed",
    tools: codexMissing,
    note: "Claude Code and Pi sessions still start normally.",
    noteTone: "muted",
    action: { label: "Install Codex", intent: "primary" },
    showAvailable: false,
    settingsLabel: "Manage in Settings",
    showCheck: false,
  },
};

/** Right-hand meta for one row: the shortest true thing about this tool. */
function RowMeta({ tool, id }: { tool: Tool; id: string }) {
  if (tool.state === "update") {
    return (
      <span
        data-trace-id={`${id}-meta`}
        data-trace-source={SOURCE}
        className="shrink-0 font-design-mono text-[11px] text-design-muted"
      >
        {tool.version} <span aria-hidden="true">→</span>{" "}
        <span className="text-design-foreground">{tool.latest}</span>
      </span>
    );
  }
  if (tool.state === "updating") {
    return (
      <span
        data-trace-id={`${id}-meta`}
        data-trace-source={SOURCE}
        className="shrink-0 font-design-mono text-[11px] text-design-secondary"
      >
        {tool.progress ?? 0}%
      </span>
    );
  }
  if (tool.state === "queued") {
    return (
      <span
        data-trace-id={`${id}-meta`}
        data-trace-source={SOURCE}
        className="shrink-0 text-[11px] font-medium text-design-muted"
      >
        <span aria-hidden="true" className="mr-1">
          •
        </span>
        Waiting
      </span>
    );
  }
  if (tool.state === "failed") {
    return (
      <span
        data-trace-id={`${id}-meta`}
        data-trace-source={SOURCE}
        className="shrink-0 text-[11px] font-semibold text-design-danger"
      >
        <span aria-hidden="true" className="mr-1">
          !
        </span>
        Failed
      </span>
    );
  }
  if (tool.state === "missing") {
    return (
      <span
        data-trace-id={`${id}-meta`}
        data-trace-source={SOURCE}
        className="shrink-0 font-design-mono text-[11px] text-design-muted"
      >
        {tool.size}
      </span>
    );
  }
  return (
    <span
      data-trace-id={`${id}-meta`}
      data-trace-source={SOURCE}
      className="shrink-0 font-design-mono text-[11px] text-design-muted"
    >
      <span aria-hidden="true" className="mr-1 text-design-success">
        ✓
      </span>
      {tool.version}
    </span>
  );
}

/**
 * Popover rows are read-only status. Every per-tool control lives in Settings, so
 * the popover stays small enough to justify existing.
 */
function PopoverRow({ tool }: { tool: Tool }) {
  const id = `tools-popover-item-${tool.id}`;
  const running = tool.state === "updating";

  return (
    <li data-trace-id={id} data-trace-source={SOURCE} className="px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <ToolMark
          shape={tool.shape}
          label={tool.name}
          size="sm"
          dimmed={tool.state === "missing" || tool.state === "queued"}
        />
        <span
          data-trace-id={`${id}-name`}
          data-trace-source={SOURCE}
          className="min-w-0 flex-1 truncate text-[13px] text-design-foreground"
        >
          {tool.name}
        </span>
        <RowMeta tool={tool} id={id} />
      </div>
      {running ? (
        <div
          role="progressbar"
          aria-label={`${tool.name} update progress`}
          aria-valuenow={tool.progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          data-trace-id={`${id}-progress`}
          data-trace-source={SOURCE}
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-design-border"
        >
          <div
            className="h-full rounded-full bg-design-secondary"
            style={{ width: `${tool.progress ?? 0}%` }}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Absent tools are inventory, not an action, so they sit at the foot of the list
 * as one line instead of an accordion. The accordion itself lives in Settings.
 */
function AvailableLine() {
  return (
    <li data-trace-id="tools-popover-available" data-trace-source={SOURCE}>
      <a
        href="#settings-coding-tools"
        className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-design-muted transition duration-design ease-design hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-design-secondary"
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-design-border text-[11px]"
        >
          +
        </span>
        <span className="min-w-0 flex-1 truncate">2 more available to install</span>
        <span aria-hidden="true">→</span>
      </a>
    </li>
  );
}

/**
 * Opened from the sidebar footer row and the only in-app surface besides
 * Settings. One action button per state; anything per-tool hands off to Settings.
 */
export function ToolsPopover({ state = "updates" }: { state?: PopoverState }) {
  const copy = copyByState[state];

  return (
    <div
      role="dialog"
      aria-label="Coding tools summary"
      data-trace-id="tools-popover"
      data-trace-source={SOURCE}
      className="overflow-hidden rounded-design-surface border border-design-border bg-design-surface shadow-design-surface"
    >
      <div
        data-trace-id="tools-popover-header"
        data-trace-source={SOURCE}
        className="px-4 pb-3 pt-3.5"
      >
        <p className="text-[13px] font-semibold text-design-foreground">Coding tools</p>
        <p
          data-trace-id="tools-popover-status"
          data-trace-source={SOURCE}
          className={cn("mt-0.5 flex items-center gap-1.5 text-xs font-medium", copy.tone)}
        >
          <span aria-hidden="true" className="leading-none">
            {copy.glyph}
          </span>
          {copy.status}
        </p>
      </div>
      <ul
        data-trace-id="tools-popover-list"
        data-trace-source={SOURCE}
        className="divide-y divide-design-border border-y border-design-border"
      >
        {copy.tools.map((tool) => (
          <PopoverRow key={tool.id} tool={tool} />
        ))}
        {copy.showAvailable ? <AvailableLine /> : null}
      </ul>
      {copy.note ? (
        <p
          data-trace-id="tools-popover-note"
          data-trace-source={SOURCE}
          className={cn(
            "px-4 pb-1 pt-2.5 text-xs leading-5",
            copy.noteTone === "danger" ? "text-design-foreground" : "text-design-muted",
          )}
        >
          {copy.noteTone === "danger" ? (
            <span aria-hidden="true" className="mr-1 font-semibold text-design-danger">
              !
            </span>
          ) : null}
          {copy.note}
        </p>
      ) : null}
      <div data-trace-id="tools-popover-actions" data-trace-source={SOURCE} className="p-3 pt-2.5">
        <button
          type="button"
          data-trace-id="tools-popover-action"
          data-trace-source={SOURCE}
          className={cn(
            "inline-flex h-8 w-full items-center justify-center rounded-design-control text-[13px] font-semibold transition duration-design ease-design focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary",
            copy.action.intent === "primary"
              ? "bg-design-primary text-design-primary-foreground hover:opacity-90"
              : "border border-design-border bg-design-background text-design-foreground hover:border-design-muted",
          )}
        >
          {copy.action.label}
        </button>
        <a
          href="#settings-coding-tools"
          data-trace-id="tools-popover-settings"
          data-trace-source={SOURCE}
          className="mt-0.5 flex h-8 items-center justify-between rounded-design-control px-2.5 text-[13px] font-medium text-design-foreground transition duration-design ease-design hover:bg-design-background focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-design-secondary"
        >
          {copy.settingsLabel}
          <span aria-hidden="true" className="text-design-muted">
            →
          </span>
        </a>
        <p
          data-trace-id="tools-popover-checked"
          data-trace-source={SOURCE}
          className="px-2.5 pb-0.5 pt-2 text-[11px] text-design-muted"
        >
          {copy.showCheck ? (
            <>
              Checked 4 minutes ago ·{" "}
              <button
                type="button"
                data-trace-id="tools-popover-check"
                data-trace-source={SOURCE}
                className="rounded-design-control font-semibold text-design-secondary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
              >
                check again
              </button>
            </>
          ) : (
            "Checked 4 minutes ago"
          )}
        </p>
      </div>
    </div>
  );
}
