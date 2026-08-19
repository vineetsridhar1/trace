import { AppWindow } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ActionTooltip } from "../../ui/ActionTooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { TraceLoader } from "../../ui/trace-loader";
import { ApplicationPreviewAction } from "./ApplicationPreviewAction";
import { SessionApplicationsPanel } from "./SessionApplicationsPanel";

const triggerClassName =
  "app-region-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground";

export function SessionApplicationsPopover({
  sessionGroupId,
  open,
  onOpenChange,
  onOpenTraffic,
  onOpenPreview,
  previewUrl,
  starting,
}: {
  sessionGroupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTraffic: (endpointId: string) => void;
  onOpenPreview: (url: string) => void;
  previewUrl: string | null;
  starting: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <ActionTooltip label={<TriggerTooltip previewUrl={previewUrl} starting={starting} />}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={cn(triggerClassName, open && "bg-white/10 text-foreground")}
              aria-label={starting ? "Application loading" : "Applications"}
              aria-busy={starting}
              aria-pressed={open}
            />
          }
        >
          {starting ? (
            <TraceLoader size={12} showLabel={false} />
          ) : (
            <AppWindow size={13} className={cn(previewUrl && "text-emerald-400")} />
          )}
        </PopoverTrigger>
      </ActionTooltip>
      <PopoverContent
        align="end"
        className="flex h-[min(36rem,calc(100dvh-5rem))] w-[24rem] flex-col overflow-hidden p-0"
      >
        {previewUrl ? (
          <ApplicationPreviewAction
            url={previewUrl}
            onOpenPreview={() => {
              onOpenPreview(previewUrl);
              onOpenChange(false);
            }}
          />
        ) : null}
        <div className="min-h-0 flex-1">
          <SessionApplicationsPanel
            sessionGroupId={sessionGroupId}
            onOpenTraffic={(endpointId) => {
              onOpenTraffic(endpointId);
              onOpenChange(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TriggerTooltip({
  previewUrl,
  starting,
}: {
  previewUrl: string | null;
  starting: boolean;
}) {
  if (starting) return <span>Application loading…</span>;
  if (!previewUrl) return <span>Applications</span>;
  return (
    <span className="flex max-w-[16rem] flex-col gap-0.5">
      <span className="truncate font-medium">{previewUrl}</span>
      <span className="opacity-70">Click to open a preview</span>
    </span>
  );
}
