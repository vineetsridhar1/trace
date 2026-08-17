import { ExternalLink } from "lucide-react";
import { useOpenArtifact } from "../../artifact/ArtifactOpenContext";
import { PLAN_IFRAME_SANDBOX, sandboxedPlanHtml } from "../../artifact/plan-html";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";

export function PlanPreviewModal({
  artifactId,
  html,
  open,
  onOpenChange,
}: {
  artifactId: string;
  html: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const openArtifact = useOpenArtifact();

  function openInWorkspaceTab() {
    onOpenChange(false);
    openArtifact(artifactId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        overlayClassName="bg-black/75"
        className="h-[80dvh] max-h-none w-[90vw] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl bg-surface-deep p-0 shadow-2xl sm:max-w-[1280px]"
      >
        <header className="flex h-12 shrink-0 items-center border-b border-border bg-surface-elevated px-4 pr-24">
          <DialogTitle className="truncate text-sm font-semibold text-foreground">
            Implementation plan
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!html}
            onClick={openInWorkspaceTab}
            aria-label="Open plan in workspace tab"
            title="Open in workspace tab"
            className="absolute right-12 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          {html ? (
            <iframe
              title="Implementation plan"
              srcDoc={sandboxedPlanHtml(html)}
              sandbox={PLAN_IFRAME_SANDBOX}
              className="size-full border-0 bg-surface-deep"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
              Loading plan…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
