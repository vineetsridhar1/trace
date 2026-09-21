import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui";
import {
  getCodingToolsSummary,
  useCodingToolsStore,
  type CodingToolsSummary,
} from "../../stores/coding-tools";
import { CodingToolMark } from "./CodingToolMark";
import { CODING_TOOL_PRESENTATION } from "./coding-tool-presentation";

const summaryMeta: Record<CodingToolsSummary, { label: string; glyph: string; tone: string }> = {
  checking: { label: "Checking for updates", glyph: "◐", tone: "text-[#3b82f6]" },
  updates: { label: "Updates available", glyph: "↑", tone: "text-[#f59e0b]" },
  updating: { label: "Updating tools", glyph: "◐", tone: "text-[#3b82f6]" },
  updated: { label: "Tools updated", glyph: "✓", tone: "text-[#22c55e]" },
  failed: { label: "An update failed", glyph: "!", tone: "text-[#ef4444]" },
  ready: { label: "All installed tools up to date", glyph: "✓", tone: "text-[#22c55e]" },
  missing: { label: "A primary tool is not installed", glyph: "+", tone: "text-[#f59e0b]" },
};

function versionLabel(status: DesktopCodingToolStatus): string {
  if (status.status === "update_available") {
    return `${status.installedVersion ?? "?"} → ${status.latestVersion ?? "latest"}`;
  }
  if (status.status === "missing") {
    return status.latestVersion ? `${status.latestVersion} available` : "Not installed";
  }
  return status.installedVersion ?? "Installed";
}

export function CodingToolsPopover({ onClose }: { onClose: () => void }) {
  const state = useCodingToolsStore();
  const summary = getCodingToolsSummary(state);
  const meta = summaryMeta[summary];
  const statuses = state.statuses ?? [];
  const updateCount = statuses.filter((status) => status.status === "update_available").length;
  const availableCount = statuses.filter(
    (status) => status.status === "missing" && !CODING_TOOL_PRESENTATION[status.tool]?.primary,
  ).length;
  const visibleStatuses = statuses.filter((status) => {
    if (summary === "updates") return status.status === "update_available";
    if (summary === "updating") return Boolean(state.operations[status.tool]);
    if (summary === "failed") {
      return Boolean(state.failures[status.tool]) || state.recentlyUpdated.includes(status.tool);
    }
    if (summary === "missing") {
      return status.status === "missing" && CODING_TOOL_PRESENTATION[status.tool]?.primary;
    }
    if (summary === "updated") return state.recentlyUpdated.includes(status.tool);
    return status.status !== "missing";
  });

  function openSettings() {
    useUIStore.getState().setSettingsInitialTab("coding-tools");
    useUIStore.getState().setActivePage("settings");
    onClose();
  }

  function runPrimaryAction() {
    if (summary === "updates") return state.updateAll();
    if (summary === "failed") {
      return Promise.allSettled(
        Object.keys(state.failures).map((toolId) => state.installOrUpdate(toolId)),
      ).then(() => undefined);
    }
    if (summary === "missing") {
      const missing = visibleStatuses[0];
      if (!missing) return Promise.resolve();
      if (missing.executableOverride) {
        openSettings();
        return Promise.resolve();
      }
      return state.installOrUpdate(missing.tool);
    }
    if (summary === "ready") return state.check();
    if (summary === "updated") {
      onClose();
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  const actionLabel =
    summary === "updates"
      ? `Update all (${updateCount})`
      : summary === "updating" || summary === "checking"
        ? "Working…"
        : summary === "failed"
          ? "Retry failed update"
          : summary === "missing"
            ? visibleStatuses[0]?.executableOverride
              ? "Choose executable"
              : `Install ${visibleStatuses[0]?.label ?? "tool"}`
            : summary === "updated"
              ? "Done"
              : "Check for updates";

  const statusLabel =
    summary === "updates"
      ? `${updateCount} updates available`
      : summary === "updated"
        ? `${state.recentlyUpdated.length} tools updated`
        : summary === "failed"
          ? `${Object.keys(state.failures).length} update failed`
          : summary === "ready"
            ? `All ${visibleStatuses.length} tools up to date`
            : summary === "missing"
              ? `${visibleStatuses[0]?.label ?? "Tool"} is not installed`
              : meta.label;
  const note =
    summary === "updates"
      ? "Sessions keep working on your current versions."
      : summary === "updating"
        ? "You can keep working. Running sessions finish on their current version."
        : summary === "updated"
          ? "Sessions already running finish on their old version."
          : summary === "missing"
            ? "Your other installed coding tools still start normally."
            : null;
  const showAvailable = availableCount > 0 && (summary === "updates" || summary === "ready");

  return (
    <div
      role="dialog"
      aria-label="Coding tools summary"
      className="overflow-hidden rounded-[12px] border border-[#3f3f46] bg-[#18181b] text-[#fafafa] shadow-[0_16px_48px_rgb(0_0_0/0.24)]"
    >
      <div className="px-4 pb-3 pt-3.5">
        <p className="text-[13px] font-semibold text-[#fafafa]">Coding tools</p>
        <p className={cn("mt-0.5 flex items-center gap-1.5 text-xs font-medium", meta.tone)}>
          <span aria-hidden="true" className="leading-none">
            {meta.glyph}
          </span>
          {statusLabel}
        </p>
      </div>
      <ul className="divide-y divide-[#3f3f46] border-y border-[#3f3f46]">
        {visibleStatuses.map((status) => {
          const presentation = CODING_TOOL_PRESENTATION[status.tool];
          if (!presentation) return null;
          const operating = state.operations[status.tool];
          const failed = state.failures[status.tool];
          return (
            <li key={status.tool} className="px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <CodingToolMark
                  shape={presentation.shape}
                  label={status.label}
                  small
                  dimmed={status.status === "missing"}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#fafafa]">
                  {status.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px] text-[#a1a1aa]",
                    operating && "text-[#3b82f6]",
                    failed && "font-sans font-semibold text-[#ef4444]",
                  )}
                >
                  {failed ? "! Failed" : operating ? "Working…" : versionLabel(status)}
                </span>
              </div>
            </li>
          );
        })}
        {showAvailable ? (
          <li>
            <button
              type="button"
              onClick={openSettings}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs text-[#a1a1aa] transition-colors duration-150 hover:text-[#fafafa] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3b82f6]"
            >
              <span className="flex size-5 items-center justify-center rounded-[5px] border border-dashed border-[#3f3f46]">
                +
              </span>
              <span className="flex-1">{availableCount} more available to install</span>
              <span aria-hidden="true">→</span>
            </button>
          </li>
        ) : null}
      </ul>
      {summary === "failed" ? (
        <p className="px-4 pb-1 pt-2.5 text-xs leading-5 text-[#fafafa]">
          <span className="mr-1 font-semibold text-[#ef4444]">!</span>
          {Object.values(state.failures)[0]}
        </p>
      ) : note ? (
        <p className="px-4 pb-1 pt-2.5 text-xs leading-5 text-[#a1a1aa]">{note}</p>
      ) : null}
      <div className="p-3 pt-2.5">
        <button
          type="button"
          className={cn(
            "inline-flex h-8 w-full items-center justify-center rounded-lg text-[13px] font-semibold transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6] disabled:opacity-50",
            summary === "ready" || summary === "updated"
              ? "border border-[#3f3f46] bg-[#09090b] text-[#fafafa] hover:border-[#a1a1aa]"
              : "bg-[#fafafa] text-[#09090b] hover:opacity-90",
          )}
          disabled={summary === "updating" || summary === "checking"}
          onClick={() => void runPrimaryAction()}
        >
          {actionLabel}
        </button>
        <button
          type="button"
          onClick={openSettings}
          className="mt-0.5 flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-[13px] font-medium text-[#fafafa] transition-colors duration-150 hover:bg-[#09090b] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3b82f6]"
        >
          Manage in Settings
          <span className="text-[#a1a1aa]">→</span>
        </button>
        <p className="px-2.5 pb-0.5 pt-2 text-[11px] text-[#a1a1aa]">
          {state.lastCheckedAt ? "Checked just now" : "Not checked yet"}
          {summary === "updates" ? (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => void state.check()}
                className="font-semibold text-[#3b82f6] underline-offset-2 hover:underline"
              >
                check again
              </button>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
