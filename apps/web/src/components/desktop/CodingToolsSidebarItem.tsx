import { useEffect, useState } from "react";
import { Grid2X2Plus } from "lucide-react";
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
      ? { label: `${updateCount} updates available`, glyph: "↑", tone: "text-[#f59e0b]" }
      : summary === "updating" || summary === "checking"
        ? { label: "Updating tools", glyph: "◐", tone: "text-[#3b82f6]" }
        : summary === "failed"
          ? { label: `${failureCount} update failed`, glyph: "!", tone: "text-[#ef4444]" }
          : summary === "missing"
            ? { label: "Primary tool missing", glyph: "+", tone: "text-[#f59e0b]" }
            : { label: "All tools ready", glyph: "✓", tone: "text-[#22c55e]" };
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
          "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-[#09090b] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3b82f6]",
          open && "bg-[#09090b]",
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-[#3f3f46] bg-[#09090b] text-[#fafafa]">
          <Grid2X2Plus className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[#fafafa]">
            Coding tools
          </span>
          <span className={cn("mt-px flex items-center gap-1 text-[11px] font-medium", copy.tone)}>
            <span aria-hidden="true" className="leading-none">
              {copy.glyph}
            </span>
            {copy.label}
          </span>
        </span>
        {badgeCount > 0 ? (
          <span className="rounded-full bg-[#f59e0b]/20 px-1.5 py-0.5 text-[11px] font-semibold text-[#fafafa]">
            {badgeCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[296px] gap-0 bg-transparent p-0 shadow-none ring-0"
      >
        <CodingToolsPopover onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
