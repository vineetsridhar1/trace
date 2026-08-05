import { useState } from "react";
import { cn } from "../lib/cn";
import { ToolTable } from "./ToolTable";
import { lastCheckedLabel, type Tool } from "./toolsData";

const SOURCE = "src/design/components/SettingsCodingTools.tsx";

const settingsNav = [
  "General",
  "Appearance",
  "Coding tools",
  "Projects",
  "Notifications",
  "Shortcuts",
  "Advanced",
];

export type SettingsSummary = "updates" | "updating" | "failed" | "ready" | "missing";

const summaryCopy: Record<
  SettingsSummary,
  {
    glyph: string;
    tint: string;
    title: string;
    note: string;
    primary: string | null;
    secondary: string | null;
    dot: string | null;
  }
> = {
  updates: {
    glyph: "↑",
    tint: "warning",
    title: "2 updates available",
    note: `${lastCheckedLabel}. Sessions keep working on your current versions.`,
    primary: "Update all (2)",
    secondary: "Check for updates",
    dot: "warning",
  },
  updating: {
    glyph: "◐",
    tint: "secondary",
    title: "Updating 2 tools",
    note: "Claude Code is downloading and Codex is queued behind it. You can keep working.",
    primary: null,
    secondary: "Cancel all",
    dot: "secondary",
  },
  failed: {
    glyph: "!",
    tint: "danger",
    title: "1 update failed",
    note: "Claude Code is on 2.1.222. Codex is still on 0.144.5. The reason is on the Codex row.",
    primary: "Retry Codex",
    secondary: null,
    dot: "danger",
  },
  ready: {
    glyph: "✓",
    tint: "success",
    title: "All 3 tools up to date",
    note: `${lastCheckedLabel}. Trace checks quietly in the background and never opens this page on its own.`,
    primary: null,
    secondary: "Check for updates",
    dot: null,
  },
  missing: {
    glyph: "+",
    tint: "warning",
    title: "Codex is not installed",
    note: "Claude Code and Pi sessions still start normally. Installing Codex unlocks Codex sessions.",
    primary: "Install Codex",
    secondary: "Check for updates",
    dot: "warning",
  },
};

function SettingsNav({ summary }: { summary: SettingsSummary }) {
  const dot = summaryCopy[summary].dot;

  return (
    <nav
      aria-label="Settings sections"
      data-trace-id="settings-nav"
      data-trace-source={SOURCE}
      className="w-[208px] shrink-0 border-r border-design-border px-3 py-4"
    >
      <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-design-muted">
        Settings
      </p>
      {settingsNav.map((item) => {
        const active = item === "Coding tools";
        return (
          <a
            key={item}
            href={`#settings-${item.toLowerCase().replace(/\s+/g, "-")}`}
            aria-current={active ? "page" : undefined}
            data-trace-id={`settings-nav-${item.toLowerCase().replace(/\s+/g, "-")}`}
            data-trace-source={SOURCE}
            className={cn(
              "flex items-center justify-between rounded-design-control px-2 py-1.5 text-[13px] transition duration-design ease-design hover:bg-design-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-design-secondary",
              active
                ? "bg-design-surface font-semibold text-design-foreground"
                : "text-design-muted",
            )}
          >
            {item}
            {active && dot ? (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: `var(--design-color-${dot})` }}
                title={summaryCopy[summary].title}
              />
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

function StatusStrip({ summary }: { summary: SettingsSummary }) {
  const copy = summaryCopy[summary];
  const tint = `var(--design-color-${copy.tint})`;

  return (
    <div
      data-trace-id="settings-status-strip"
      data-trace-source={SOURCE}
      className="flex items-center justify-between gap-4 rounded-design-surface border border-design-border px-4 py-3.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${tint} 9%, transparent)`,
        borderColor: `color-mix(in srgb, ${tint} 38%, transparent)`,
      }}
    >
      <div className="min-w-0">
        <p
          data-trace-id="settings-status-title"
          data-trace-source={SOURCE}
          className="flex items-center gap-2 text-sm font-semibold text-design-foreground"
        >
          <span aria-hidden="true" className="leading-none" style={{ color: tint }}>
            {copy.glyph}
          </span>
          {copy.title}
        </p>
        <p
          data-trace-id="settings-status-note"
          data-trace-source={SOURCE}
          className="mt-1 text-xs leading-5 text-design-muted"
        >
          {copy.note}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {copy.secondary ? (
          <button
            type="button"
            data-trace-id="settings-status-secondary"
            data-trace-source={SOURCE}
            className="inline-flex h-8 items-center rounded-design-control border border-design-border bg-design-surface px-3 text-[13px] font-semibold text-design-foreground transition duration-design ease-design hover:border-design-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
          >
            {copy.secondary}
          </button>
        ) : null}
        {copy.primary ? (
          <button
            type="button"
            data-trace-id="settings-status-primary"
            data-trace-source={SOURCE}
            className="inline-flex h-8 items-center rounded-design-control bg-design-primary px-3 text-[13px] font-semibold text-design-primary-foreground transition duration-design ease-design hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
          >
            {copy.primary}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PrefRow({
  id,
  label,
  description,
  defaultOn,
}: {
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
}) {
  const [on, setOn] = useState(defaultOn);

  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-design-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-design-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((value) => !value)}
        data-trace-id={id}
        data-trace-source={SOURCE}
        className="mt-0.5 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-secondary"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative flex h-[18px] w-8 items-center rounded-full border transition duration-design ease-design",
            on ? "border-design-secondary bg-design-secondary" : "border-design-border",
          )}
        >
          <span
            className={cn(
              "absolute h-3 w-3 rounded-full transition-all duration-design ease-design",
              on ? "left-[16px] bg-design-primary-foreground" : "left-[3px] bg-design-muted",
            )}
          />
        </span>
      </button>
    </div>
  );
}

function Preferences() {
  return (
    <section data-trace-id="settings-preferences" data-trace-source={SOURCE}>
      <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-design-muted">
        Preferences
      </h3>
      <div className="divide-y divide-design-border rounded-design-surface border border-design-border bg-design-background">
        <PrefRow
          id="pref-auto-update"
          label="Update automatically"
          description="Apply updates in the background when no session is running."
          defaultOn
        />
        <PrefRow
          id="pref-notify"
          label="Show a count in the sidebar"
          description="Trace never opens this page on its own. Turn this off to check manually instead."
          defaultOn
        />
        <PrefRow
          id="pref-prerelease"
          label="Include prerelease versions"
          description="Offer beta builds. Useful for testing, riskier for daily work."
          defaultOn={false}
        />
      </div>
    </section>
  );
}

type SettingsCodingToolsProps = {
  tools?: Tool[];
  summary?: SettingsSummary;
  accordionOpen?: boolean;
  expandedId?: string | null;
};

export function SettingsCodingTools({
  tools,
  summary = "updates",
  accordionOpen = false,
  expandedId = null,
}: SettingsCodingToolsProps) {
  return (
    <div
      data-trace-id="settings-layout"
      data-trace-source={SOURCE}
      className="flex h-full min-h-0"
    >
      <SettingsNav summary={summary} />
      <div
        data-trace-id="settings-content"
        data-trace-source={SOURCE}
        className="min-w-0 flex-1 overflow-y-auto px-6 py-5"
      >
        <header data-trace-id="settings-header" data-trace-source={SOURCE} className="mb-4">
          <h2 className="font-design-display text-lg font-semibold tracking-[-0.02em] text-design-foreground">
            Coding tools
          </h2>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-6 text-design-muted">
            Trace installs and updates the command line tools that power local sessions. Claude Code
            and Codex stay listed here whether or not they are installed, because every workspace
            can start those sessions.
          </p>
        </header>
        <div className="space-y-4">
          <StatusStrip summary={summary} />
          <section>
            <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-design-muted">
              On this computer
            </h3>
            <ToolTable tools={tools} accordionOpen={accordionOpen} expandedId={expandedId} />
          </section>
          <Preferences />
        </div>
      </div>
    </div>
  );
}
