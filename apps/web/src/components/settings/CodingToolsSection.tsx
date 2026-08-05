import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleAlert, LoaderCircle, Plus, Upload } from "lucide-react";
import { cn } from "../../lib/utils";
import { getCodingToolsSummary, useCodingToolsStore } from "../../stores/coding-tools";
import { CODING_TOOL_PRESENTATION } from "../desktop/coding-tool-presentation";
import { Button } from "../ui/button";
import { CodingToolSettingsRow } from "./CodingToolSettingsRow";

function PreferenceSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <div>
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "border-blue-500 bg-blue-500" : "border-border bg-transparent",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-3 rounded-full transition-all",
            checked ? "left-[16px] bg-white" : "left-[3px] bg-muted-foreground",
          )}
        />
      </button>
    </div>
  );
}

export function CodingToolsSection() {
  const [availableOpen, setAvailableOpen] = useState(false);
  const state = useCodingToolsStore();
  const summary = getCodingToolsSummary(state);
  const statuses = state.statuses ?? [];
  const topLevel = statuses.filter(
    (status) => status.status !== "missing" || CODING_TOOL_PRESENTATION[status.tool]?.primary,
  );
  const available = statuses.filter(
    (status) => status.status === "missing" && !CODING_TOOL_PRESENTATION[status.tool]?.primary,
  );
  const updateCount = statuses.filter((status) => status.status === "update_available").length;

  useEffect(() => {
    if (!state.statuses && !state.checking) void state.check();
  }, [state]);

  const strip =
    summary === "updates"
      ? {
          title: `${updateCount} updates available`,
          note: "Sessions keep working on their current versions.",
          icon: Upload,
          tone: "amber",
        }
      : summary === "updating" || summary === "checking"
        ? {
            title: "Updating coding tools",
            note: "You can keep working while Trace finishes.",
            icon: LoaderCircle,
            tone: "blue",
          }
        : summary === "failed"
          ? {
              title: `${Object.keys(state.failures).length} update failed`,
              note: "The reason is attached to the affected tool.",
              icon: CircleAlert,
              tone: "red",
            }
          : summary === "missing"
            ? {
                title: "A primary tool is not installed",
                note: "Other installed coding tools continue to work normally.",
                icon: Plus,
                tone: "amber",
              }
            : {
                title: "All installed tools are up to date",
                note: "Trace checks quietly and never opens this page on its own.",
                icon: Check,
                tone: "green",
              };
  const StripIcon = strip.icon;
  const toneClasses = {
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    blue: "border-blue-500/40 bg-blue-500/10 text-blue-400",
    red: "border-destructive/40 bg-destructive/10 text-destructive",
    green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  }[strip.tone];

  function runMainAction() {
    if (summary === "updates") return state.updateAll();
    if (summary === "failed") {
      return Promise.allSettled(
        Object.keys(state.failures).map((toolId) => state.installOrUpdate(toolId)),
      );
    }
    if (summary === "missing") {
      const missing = topLevel.find((status) => status.status === "missing");
      return missing ? state.installOrUpdate(missing.tool) : Promise.resolve();
    }
    return state.check();
  }

  return (
    <div>
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">Coding tools</h2>
        <p className="mt-1 max-w-[70ch] text-[13px] leading-6 text-muted-foreground">
          Trace installs and updates the command-line tools that power local sessions. Claude Code
          and Codex stay listed whether or not they are installed.
        </p>
      </header>

      <div className="space-y-4">
        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5",
            toneClasses,
          )}
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <StripIcon
                className={cn(
                  "size-4",
                  (summary === "updating" || summary === "checking") && "animate-spin",
                )}
              />
              {strip.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{strip.note}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {summary !== "updating" && summary !== "checking" ? (
              <Button variant="outline" size="sm" onClick={() => void state.check()}>
                Check for updates
              </Button>
            ) : null}
            {summary === "updates" || summary === "failed" || summary === "missing" ? (
              <Button size="sm" onClick={() => void runMainAction()}>
                {summary === "updates"
                  ? `Update all (${updateCount})`
                  : summary === "failed"
                    ? "Retry failed"
                    : "Install"}
              </Button>
            ) : null}
          </div>
        </div>

        <section>
          <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            On this computer
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-deep">
            <div className="flex min-w-[760px] items-center gap-4 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <span className="min-w-0 flex-1">Tool</span>
              <span className="w-[90px]">Size</span>
              <span className="w-[160px]">Version</span>
              <span className="w-[150px]">Status</span>
              <span className="w-[104px] text-right">Action</span>
            </div>
            <div className="divide-y divide-border">
              {topLevel.map((status) => (
                <CodingToolSettingsRow
                  key={status.tool}
                  status={status}
                  operation={state.operations[status.tool]}
                  failure={state.failures[status.tool]}
                  recentlyUpdated={state.recentlyUpdated.includes(status.tool)}
                  onAction={() => void state.installOrUpdate(status.tool).catch(() => undefined)}
                />
              ))}
            </div>
          </div>

          {available.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface-deep">
              <button
                type="button"
                onClick={() => setAvailableOpen((value) => !value)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                  +
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    Available to install
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {available.length} optional tools
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    availableOpen && "rotate-180",
                  )}
                />
              </button>
              {availableOpen ? (
                <div className="divide-y divide-border border-t border-border">
                  {available.map((status) => (
                    <CodingToolSettingsRow
                      key={status.tool}
                      status={status}
                      operation={state.operations[status.tool]}
                      failure={state.failures[status.tool]}
                      recentlyUpdated={false}
                      onAction={() =>
                        void state.installOrUpdate(status.tool).catch(() => undefined)
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section>
          <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Preferences
          </h3>
          <div className="divide-y divide-border rounded-xl border border-border bg-surface-deep">
            <PreferenceSwitch
              label="Check for updates when Trace opens"
              description="Checks quietly in the background without opening a dialog."
              checked={state.checkOnLaunch}
              onChange={state.setCheckOnLaunch}
            />
            <PreferenceSwitch
              label="Show a count in the sidebar"
              description="Turn this off to check manually from Coding tools instead."
              checked={state.showSidebarCount}
              onChange={state.setShowSidebarCount}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
