import { useEffect, useState } from "react";
import { Check, Copy, MonitorPlay } from "lucide-react";
import { ActionTooltip } from "../../ui/ActionTooltip";
import { Button } from "../../ui/button";

/** Shown at the top of the applications popover once an endpoint is serving. */
export function ApplicationPreviewAction({
  url,
  onOpenPreview,
}: {
  url: string;
  onOpenPreview: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeoutId = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

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
      <div className="flex shrink-0 items-center gap-1">
        <ActionTooltip label="Open preview">
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            onClick={onOpenPreview}
            aria-label="Open preview"
          >
            <MonitorPlay />
          </Button>
        </ActionTooltip>
        <ActionTooltip label={copied ? "Copied" : "Copy URL"}>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            onClick={() => void handleCopy()}
            aria-label={copied ? "URL copied" : "Copy URL"}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </ActionTooltip>
      </div>
    </div>
  );
}
