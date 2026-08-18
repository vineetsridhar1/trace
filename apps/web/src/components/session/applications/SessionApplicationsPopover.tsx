import { AppWindow } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ActionTooltip } from "../../ui/ActionTooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { SessionApplicationsPanel } from "./SessionApplicationsPanel";

const triggerClassName =
  "app-region-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground";

export function SessionApplicationsPopover({
  sessionGroupId,
  open,
  onOpenChange,
  onOpenTraffic,
}: {
  sessionGroupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTraffic: (endpointId: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <ActionTooltip label="Applications">
        <PopoverTrigger
          render={
            <button
              type="button"
              className={cn(triggerClassName, open && "bg-white/10 text-foreground")}
              aria-label="Applications"
              aria-pressed={open}
            />
          }
        >
          <AppWindow size={13} />
        </PopoverTrigger>
      </ActionTooltip>
      <PopoverContent align="end" className="h-[min(36rem,calc(100dvh-5rem))] w-[24rem] overflow-hidden p-0">
        <SessionApplicationsPanel
          sessionGroupId={sessionGroupId}
          onOpenTraffic={(endpointId) => {
            onOpenTraffic(endpointId);
            onOpenChange(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
