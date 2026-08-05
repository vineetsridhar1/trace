import { Check, CircleAlert, LoaderCircle, Plus, RefreshCw, Settings, Upload } from "lucide-react";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui";
import {
  getCodingToolsSummary,
  useCodingToolsStore,
  type CodingToolsSummary,
} from "../../stores/coding-tools";
import { Button } from "../ui/button";
import { CodingToolMark } from "./CodingToolMark";
import { CODING_TOOL_PRESENTATION } from "./coding-tool-presentation";

const summaryMeta: Record<CodingToolsSummary, { label: string; icon: typeof Check; tone: string }> =
  {
    checking: { label: "Checking for updates", icon: LoaderCircle, tone: "text-blue-400" },
    updates: { label: "Updates available", icon: Upload, tone: "text-amber-400" },
    updating: { label: "Updating tools", icon: LoaderCircle, tone: "text-blue-400" },
    updated: { label: "Tools updated", icon: Check, tone: "text-emerald-400" },
    failed: { label: "An update failed", icon: CircleAlert, tone: "text-destructive" },
    ready: { label: "All installed tools up to date", icon: Check, tone: "text-emerald-400" },
    missing: { label: "A primary tool is not installed", icon: Plus, tone: "text-amber-400" },
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
  const Icon = meta.icon;
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
      return missing ? state.installOrUpdate(missing.tool) : Promise.resolve();
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
            ? `Install ${visibleStatuses[0]?.label ?? "tool"}`
            : summary === "updated"
              ? "Done"
              : "Check for updates";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
      <div className="px-4 pb-3 pt-3.5">
        <p className="text-[13px] font-semibold text-foreground">Coding tools</p>
        <p className={cn("mt-1 flex items-center gap-1.5 text-xs font-medium", meta.tone)}>
          <Icon
            className={cn(
              "size-3.5",
              (summary === "updating" || summary === "checking") && "animate-spin",
            )}
          />
          {summary === "updates" ? `${updateCount} updates available` : meta.label}
        </p>
      </div>
      <ul className="divide-y divide-border border-y border-border">
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
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {status.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px] text-muted-foreground",
                    operating && "text-blue-400",
                    failed && "font-sans font-semibold text-destructive",
                  )}
                >
                  {failed ? "! Failed" : operating ? "Working…" : versionLabel(status)}
                </span>
              </div>
            </li>
          );
        })}
        {availableCount > 0 && summary !== "missing" ? (
          <li>
            <button
              type="button"
              onClick={openSettings}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <span className="flex size-5 items-center justify-center rounded-[5px] border border-dashed border-border">
                +
              </span>
              <span className="flex-1">{availableCount} more available to install</span>
              <span aria-hidden="true">→</span>
            </button>
          </li>
        ) : null}
      </ul>
      {summary === "failed" ? (
        <p className="px-4 pt-2.5 text-xs leading-5 text-foreground">
          <span className="mr-1 text-destructive">!</span>
          {Object.values(state.failures)[0]}
        </p>
      ) : null}
      <div className="space-y-1 p-3">
        <Button
          className="w-full"
          variant={summary === "ready" || summary === "updated" ? "outline" : "default"}
          disabled={summary === "updating" || summary === "checking"}
          onClick={() => void runPrimaryAction()}
        >
          {summary === "updating" || summary === "checking" ? (
            <RefreshCw className="animate-spin" />
          ) : null}
          {actionLabel}
        </Button>
        <button
          type="button"
          onClick={openSettings}
          className="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-white/5"
        >
          <span className="flex items-center gap-2">
            <Settings className="size-3.5" /> Manage in Settings
          </span>
          <span className="text-muted-foreground">→</span>
        </button>
        <p className="px-2.5 pt-1 text-[11px] text-muted-foreground">
          {state.lastCheckedAt ? "Checked just now" : "Not checked yet"}
        </p>
      </div>
    </div>
  );
}
