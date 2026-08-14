import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { getCodingToolsSummary, useCodingToolsStore } from "../../stores/coding-tools";
import { CODING_TOOL_PRESENTATION } from "../desktop/coding-tool-presentation";
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
        <p className="text-[13px] font-semibold text-[#fafafa]">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-[#a1a1aa]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "border-[#3b82f6] bg-[#3b82f6]" : "border-[#3f3f46] bg-transparent",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-3 rounded-full transition-all",
            checked ? "left-[16px] bg-[#09090b]" : "left-[3px] bg-[#a1a1aa]",
          )}
        />
      </button>
    </div>
  );
}

export function CodingToolsSection() {
  const [availableOpen, setAvailableOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [includePrerelease, setIncludePrerelease] = useState(false);
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
          glyph: "↑",
          tone: "amber",
        }
      : summary === "updating" || summary === "checking"
        ? {
            title: "Updating coding tools",
            note: "You can keep working while Trace finishes.",
            glyph: "◐",
            tone: "blue",
          }
        : summary === "failed"
          ? {
              title: `${Object.keys(state.failures).length} update failed`,
              note: "The reason is attached to the affected tool.",
              glyph: "!",
              tone: "red",
            }
          : summary === "missing"
            ? {
                title: "A primary tool is not installed",
                note: "Other installed coding tools continue to work normally.",
                glyph: "+",
                tone: "amber",
              }
            : {
                title: "All installed tools are up to date",
                note: "Trace checks quietly and never opens this page on its own.",
                glyph: "✓",
                tone: "green",
              };
  const toneClasses = {
    amber: "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]",
    blue: "border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#3b82f6]",
    red: "border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]",
    green: "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]",
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
    <div className="text-[#fafafa]">
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#fafafa]">Coding tools</h2>
        <p className="mt-1 max-w-[70ch] text-[13px] leading-6 text-[#a1a1aa]">
          Trace installs and updates the command line tools that power local sessions. Claude Code
          and Codex stay listed here whether or not they are installed, because every workspace can
          start those sessions.
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
            <p className="flex items-center gap-2 text-sm font-semibold text-[#fafafa]">
              <span aria-hidden="true" className="leading-none">
                {strip.glyph}
              </span>
              {strip.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#a1a1aa]">{strip.note}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {summary !== "updating" && summary !== "checking" ? (
              <button
                type="button"
                onClick={() => void state.check()}
                className="inline-flex h-8 items-center rounded-lg border border-[#3f3f46] bg-[#18181b] px-3 text-[13px] font-semibold text-[#fafafa] hover:border-[#a1a1aa]"
              >
                Check for updates
              </button>
            ) : null}
            {summary === "updates" || summary === "failed" || summary === "missing" ? (
              <button
                type="button"
                onClick={() => void runMainAction()}
                className="inline-flex h-8 items-center rounded-lg bg-[#fafafa] px-3 text-[13px] font-semibold text-[#09090b] hover:opacity-90"
              >
                {summary === "updates"
                  ? `Update all (${updateCount})`
                  : summary === "failed"
                    ? "Retry failed"
                    : "Install"}
              </button>
            ) : null}
          </div>
        </div>

        <section>
          <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a1a1aa]">
            On this computer
          </h3>
          <div className="overflow-hidden rounded-[12px] border border-[#3f3f46] bg-[#09090b]">
            <div className="flex min-w-0 items-center gap-4 border-b border-[#3f3f46] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a1a1aa]">
              <span className="min-w-0 flex-1">Tool</span>
              <span className="w-[90px]">Size</span>
              <span className="w-[160px]">Version</span>
              <span className="w-[150px]">Status</span>
              <span className="w-[104px] text-right">Action</span>
            </div>
            <div className="divide-y divide-[#3f3f46]">
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
            <div className="mt-3 overflow-hidden rounded-[12px] border border-[#3f3f46] bg-[#09090b]">
              <button
                type="button"
                onClick={() => setAvailableOpen((value) => !value)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-dashed border-[#3f3f46] text-[#a1a1aa]">
                  +
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-[#fafafa]">
                    Available to install
                  </span>
                  <span className="text-xs text-[#a1a1aa]">{available.length} optional tools</span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-[#a1a1aa] transition-transform",
                    availableOpen && "rotate-180",
                  )}
                />
              </button>
              {availableOpen ? (
                <div className="divide-y divide-[#3f3f46] border-t border-[#3f3f46]">
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
          <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a1a1aa]">
            Preferences
          </h3>
          <div className="divide-y divide-[#3f3f46] rounded-[12px] border border-[#3f3f46] bg-[#09090b]">
            <PreferenceSwitch
              label="Update automatically"
              description="Apply updates in the background when no session is running."
              checked={autoUpdate}
              onChange={setAutoUpdate}
            />
            <PreferenceSwitch
              label="Include prerelease versions"
              description="Offer beta builds. Useful for testing, riskier for daily work."
              checked={includePrerelease}
              onChange={setIncludePrerelease}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
