import { useEffect, useState } from "react";
import { Check, CircleAlert, Grid2X2Plus, LoaderCircle, Plus, Upload } from "lucide-react";
import { cn } from "../../lib/utils";
import { getCodingToolsSummary, useCodingToolsStore } from "../../stores/coding-tools";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { CodingToolsPopover } from "./CodingToolsPopover";

export function CodingToolsSidebarItem() {
  const [open, setOpen] = useState(false);
  const state = useCodingToolsStore();
  const summary = getCodingToolsSummary(state);
  const updateCount =
    state.statuses?.filter((status) => status.status === "update_available").length ?? 0;
  const failureCount = Object.keys(state.failures).length;

  useEffect(() => {
    if (useCodingToolsStore.getState().checkOnLaunch) {
      void useCodingToolsStore.getState().check();
    }
  }, []);

  if (!window.trace?.getCodingToolStatuses) return null;

  const copy =
    summary === "updates"
      ? { label: `${updateCount} updates available`, icon: Upload, tone: "text-amber-400" }
      : summary === "updating" || summary === "checking"
        ? { label: "Updating tools", icon: LoaderCircle, tone: "text-blue-400" }
        : summary === "failed"
          ? { label: `${failureCount} update failed`, icon: CircleAlert, tone: "text-destructive" }
          : summary === "missing"
            ? { label: "Primary tool missing", icon: Plus, tone: "text-amber-400" }
            : { label: "All tools ready", icon: Check, tone: "text-emerald-400" };
  const StatusIcon = copy.icon;
  const badgeCount = state.showSidebarCount
    ? summary === "updates"
      ? updateCount
      : summary === "failed"
        ? failureCount
        : 0
    : 0;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !state.statuses && !state.checking) void state.check();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10",
          open && "bg-white/10",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-deep text-foreground">
          <Grid2X2Plus className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            Coding tools
          </span>
          <span className={cn("mt-px flex items-center gap-1 text-[11px] font-medium", copy.tone)}>
            <StatusIcon
              className={cn(
                "size-3",
                (summary === "updating" || summary === "checking") && "animate-spin",
              )}
            />
            {copy.label}
          </span>
        </span>
        {badgeCount > 0 ? (
          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
            {badgeCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={6} className="w-[296px] gap-0 p-0">
        <CodingToolsPopover onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
