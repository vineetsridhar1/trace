import type { ReactNode } from "react";
import { cn } from "../lib/cn";

const SOURCE = "src/design/components/AppChrome.tsx";

function WindowControls() {
  return (
    <div
      data-trace-id="window-controls"
      data-trace-source={SOURCE}
      className="flex items-center gap-2"
      aria-hidden="true"
    >
      <span className="h-3 w-3 rounded-full bg-design-danger" />
      <span className="h-3 w-3 rounded-full bg-design-warning" />
      <span className="h-3 w-3 rounded-full bg-design-success" />
    </div>
  );
}

function ToolsGlyph() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] border border-design-border bg-design-background text-design-foreground">
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1.2" />
        <rect x="9" y="2.4" width="4.6" height="4.6" rx="1.2" />
        <rect x="2.4" y="9" width="4.6" height="4.6" rx="1.2" />
        <path d="M11.3 9.4v4M9.3 11.4h4" />
      </svg>
    </span>
  );
}

export type ToolsRowState = "updates" | "ready" | "installing" | "failed" | "missing";

const toolsRowCopy: Record<ToolsRowState, { glyph: string; tone: string; label: string }> = {
  updates: { glyph: "↑", tone: "text-design-warning", label: "2 updates available" },
  installing: {
    glyph: "◐",
    tone: "text-design-secondary",
    label: "Updating 2 tools",
  },
  ready: { glyph: "✓", tone: "text-design-success", label: "All tools ready" },
  failed: { glyph: "!", tone: "text-design-danger", label: "1 update failed" },
  missing: { glyph: "+", tone: "text-design-warning", label: "Codex not installed" },
};

export function SidebarToolsRow({ state, active }: { state: ToolsRowState; active: boolean }) {
  const copy = toolsRowCopy[state];

  return (
    <button
      type="button"
      aria-expanded={active}
      data-trace-id="sidebar-tools-row"
      data-trace-source={SOURCE}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-design-control px-2 py-2 text-left transition duration-design ease-design hover:bg-design-background focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-design-secondary",
        active && "bg-design-background",
      )}
    >
      <ToolsGlyph />
      <span className="min-w-0 flex-1">
        <span
          data-trace-id="sidebar-tools-title"
          data-trace-source={SOURCE}
          className="block truncate text-[13px] font-semibold text-design-foreground"
        >
          Coding tools
        </span>
        <span
          data-trace-id="sidebar-tools-status"
          data-trace-source={SOURCE}
          className={cn("mt-px flex items-center gap-1 text-[11px] font-medium", copy.tone)}
        >
          <span aria-hidden="true" className="leading-none">
            {copy.glyph}
          </span>
          {copy.label}
        </span>
      </span>
      {state === "updates" || state === "failed" ? (
        <span
          data-trace-id="sidebar-tools-count"
          data-trace-source={SOURCE}
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-design-foreground"
          style={{
            backgroundColor: `color-mix(in srgb, var(--design-color-${
              state === "failed" ? "danger" : "warning"
            }) 22%, transparent)`,
          }}
        >
          {state === "failed" ? "1" : "2"}
        </span>
      ) : null}
    </button>
  );
}

function NavItem({
  label,
  id,
  badge,
  active = false,
  depth = 0,
}: {
  label: string;
  id: string;
  badge?: string;
  active?: boolean;
  depth?: number;
}) {
  return (
    <a
      href={`#${id}`}
      data-trace-id={id}
      data-trace-source={SOURCE}
      className={cn(
        "flex items-center gap-2 rounded-design-control py-1.5 pr-2 text-[13px] transition duration-design ease-design hover:bg-design-background focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-design-secondary",
        active ? "font-semibold text-design-secondary" : "text-design-foreground",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      {depth > 0 ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-design-muted" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-design-secondary px-1.5 text-[10px] font-semibold leading-4 text-design-primary-foreground">
          {badge}
        </span>
      ) : null}
    </a>
  );
}

function NavGroupLabel({ children, id }: { children: string; id: string }) {
  return (
    <p
      data-trace-id={id}
      data-trace-source={SOURCE}
      className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-design-muted"
    >
      {children}
    </p>
  );
}

function Sidebar({
  toolsState,
  toolsActive,
}: {
  toolsState: ToolsRowState;
  toolsActive: boolean;
}) {
  return (
    <nav
      aria-label="Workspace"
      data-trace-id="sidebar"
      data-trace-source={SOURCE}
      className="flex w-[252px] shrink-0 flex-col border-r border-design-border bg-design-surface"
    >
      <div
        data-trace-id="sidebar-header"
        data-trace-source={SOURCE}
        className="flex items-center gap-3 px-4 pb-3 pt-4"
      >
        <WindowControls />
        <span className="ml-1 flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-design-secondary text-[11px] font-bold text-design-primary-foreground"
          >
            T
          </span>
          <span
            data-trace-id="sidebar-workspace"
            data-trace-source={SOURCE}
            className="truncate text-[13px] font-semibold text-design-foreground"
          >
            trace
          </span>
        </span>
      </div>
      <div
        data-trace-id="sidebar-scroll"
        data-trace-source={SOURCE}
        className="flex-1 overflow-y-auto px-2 pb-2"
      >
        <NavItem label="Home" id="nav-home" />
        <NavItem label="Inbox" id="nav-inbox" badge="3" />
        <NavGroupLabel id="nav-group-create">Create</NavGroupLabel>
        <NavItem label="Apps" id="nav-apps" />
        <NavItem label="Untitled App" id="nav-app-1" depth={1} />
        <NavItem label="Designs" id="nav-designs" />
        <NavItem label="Coding tool readiness" id="nav-design-1" depth={1} />
        <NavItem label="Mobile onboarding flow" id="nav-design-2" depth={1} />
        <NavItem label="Documents" id="nav-documents" />
        <NavItem label="Clarify document request" id="nav-doc-1" depth={1} />
        <NavItem label="Animations" id="nav-animations" />
        <NavGroupLabel id="nav-group-projects">Projects</NavGroupLabel>
        <NavItem label="wavelength" id="nav-project-wavelength" />
        <NavItem label="In Progress" id="nav-project-inprogress" depth={1} active />
        <NavItem label="Refactor auth token refresh" id="nav-session-1" depth={2} />
        <NavItem label="Port payments webhook" id="nav-session-2" depth={2} />
      </div>
      <SidebarFooter toolsState={toolsState} toolsActive={toolsActive} />
    </nav>
  );
}

/**
 * The footer is the only entry point to coding tools, so it is shared with the
 * standalone popover artboards rather than re-drawn for them.
 */
export function SidebarFooter({
  toolsState,
  toolsActive,
}: {
  toolsState: ToolsRowState;
  toolsActive: boolean;
}) {
  return (
    <div
      data-trace-id="sidebar-footer"
      data-trace-source={SOURCE}
      className="border-t border-design-border px-2 py-2"
    >
      <SidebarToolsRow state={toolsState} active={toolsActive} />
      <div
        data-trace-id="sidebar-account"
        data-trace-source={SOURCE}
        className="mt-1 flex items-center gap-2.5 rounded-design-control px-2 py-2"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-design-border bg-design-background text-[10px] font-semibold text-design-muted"
        >
          VS
        </span>
        <span className="truncate text-[13px] font-medium text-design-foreground">
          Vineet Sridhar
        </span>
      </div>
    </div>
  );
}

function TopBar({
  title,
  subtitle,
  showActions,
  onNewSession,
}: {
  title: string;
  subtitle: string;
  showActions: boolean;
  onNewSession?: () => void;
}) {
  return (
    <div
      data-trace-id="topbar"
      data-trace-source={SOURCE}
      className="flex items-center justify-between gap-4 border-b border-design-border px-6 py-3.5"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <h1
          data-trace-id="topbar-title"
          data-trace-source={SOURCE}
          className="font-design-display text-[15px] font-semibold tracking-[-0.01em] text-design-foreground"
        >
          {title}
        </h1>
        <span
          data-trace-id="topbar-subtitle"
          data-trace-source={SOURCE}
          className="truncate text-[13px] text-design-muted"
        >
          {subtitle}
        </span>
      </div>
      <div className={cn("flex shrink-0 items-center gap-2", !showActions && "hidden")}>
        <button
          type="button"
          data-trace-id="topbar-filter"
          data-trace-source={SOURCE}
          className="inline-flex h-8 items-center rounded-design-control border border-design-border px-3 text-[13px] font-medium text-design-muted transition duration-design ease-design hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={onNewSession}
          data-trace-id="topbar-new-session"
          data-trace-source={SOURCE}
          className="inline-flex h-8 items-center rounded-design-control bg-design-primary px-3 text-[13px] font-semibold text-design-primary-foreground transition duration-design ease-design hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
        >
          New session
        </button>
      </div>
    </div>
  );
}

type AppChromeProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showActions?: boolean;
  toolsState?: ToolsRowState;
  toolsActive?: boolean;
  toolsPopover?: ReactNode;
  overlay?: ReactNode;
  onNewSession?: () => void;
};

export function AppChrome({
  children,
  title = "wavelength",
  subtitle = "Sessions",
  showActions = true,
  toolsState = "updates",
  toolsActive = false,
  toolsPopover,
  overlay,
  onNewSession,
}: AppChromeProps) {
  return (
    <div
      data-trace-id="app-window"
      data-trace-source={SOURCE}
      className="relative flex h-full overflow-hidden bg-design-background font-design-body text-design-foreground"
    >
      <Sidebar toolsState={toolsState} toolsActive={toolsActive} />
      <div
        data-trace-id="app-main"
        data-trace-source={SOURCE}
        className="flex min-w-0 flex-1 flex-col"
      >
        <TopBar
          title={title}
          subtitle={subtitle}
          showActions={showActions}
          onNewSession={onNewSession}
        />
        <div
          data-trace-id="app-content"
          data-trace-source={SOURCE}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {children}
        </div>
      </div>
      {toolsPopover ? (
        <div
          data-trace-id="tools-popover-layer"
          data-trace-source={SOURCE}
          className="absolute bottom-[108px] left-2 z-10 w-[296px]"
        >
          {toolsPopover}
        </div>
      ) : null}
      {overlay}
    </div>
  );
}
