import { ExternalLink } from "lucide-react";
import { sandboxedPlanHtml } from "../../artifact/plan-html";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";

export function PlanPreviewModal({
  html,
  open,
  onOpenChange,
}: {
  html: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  function openInNewTab() {
    if (!html) return;
    const url = URL.createObjectURL(
      new Blob([sandboxedPlanHtml(html)], { type: "text/html;charset=utf-8" }),
    );
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        overlayClassName="bg-black/60 backdrop-blur-sm"
        className="h-[calc(100dvh-1.5rem)] max-h-none max-w-[calc(100%-1.5rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl bg-[#0d0f12] p-0 shadow-2xl sm:h-[calc(100dvh-3rem)] sm:max-w-[calc(100%-3rem)]"
      >
        <header className="flex h-12 shrink-0 items-center border-b border-[#2d3138] bg-[#171a1f] px-4 pr-24">
          <DialogTitle className="truncate text-sm font-semibold text-[#f1f3f5]">
            Implementation plan
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!html}
            onClick={openInNewTab}
            aria-label="Open plan in new tab"
            title="Open in new tab"
            className="absolute right-12 top-2.5 text-[#9ba1aa] hover:text-[#f1f3f5]"
          >
            <ExternalLink className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          {html ? (
            <iframe
              title="Implementation plan"
              srcDoc={sandboxedPlanHtml(html)}
              sandbox=""
              className="size-full border-0 bg-[#0d0f12]"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-[#9ba1aa]">
              Loading plan…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
