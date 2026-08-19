import { MonitorPlay } from "lucide-react";
import { Button } from "../../ui/button";

/** Shown at the top of the applications popover once an endpoint is serving. */
export function ApplicationPreviewAction({
  url,
  onOpenPreview,
}: {
  url: string;
  onOpenPreview: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-deep px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Application
        </p>
        <p className="truncate text-xs text-foreground" title={url}>
          {url}
        </p>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={onOpenPreview}>
        <MonitorPlay size={14} />
        Open preview
      </Button>
    </div>
  );
}
