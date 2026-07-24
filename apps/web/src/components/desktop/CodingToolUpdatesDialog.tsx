import { useEffect, useState } from "react";
import { Check, CircleAlert, Download, RefreshCw, Wrench } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

function needsAttention(status: DesktopCodingToolStatus): boolean {
  return status.status === "missing" || status.status === "update_available";
}

function statusCopy(status: DesktopCodingToolStatus): string {
  if (status.status === "missing") return "Not installed";
  if (status.status === "update_available") {
    return `Version ${status.installedVersion ?? "unknown"} → ${status.latestVersion ?? "latest"}`;
  }
  if (status.status === "installed") {
    return status.installedVersion ? `Version ${status.installedVersion}` : "Installed";
  }
  return "Version check unavailable";
}

export function CodingToolUpdatesDialog() {
  const [statuses, setStatuses] = useState<DesktopCodingToolStatus[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingTool, setLoadingTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.trace?.getCodingToolStatuses) return;
    let cancelled = false;
    void window.trace
      .getCodingToolStatuses()
      .then((nextStatuses) => {
        if (cancelled) return;
        setStatuses(nextStatuses);
        setOpen(nextStatuses.some(needsAttention));
      })
      .catch(() => {
        // Version checks are best effort. A network outage must not block Trace.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function installOrUpdate(toolId: string) {
    if (!window.trace?.installOrUpdateCodingTool || loadingTool) return;
    setLoadingTool(toolId);
    setError(null);
    try {
      const updated = await window.trace.installOrUpdateCodingTool(toolId);
      setStatuses((current) => current.map((status) => (status.tool === toolId ? updated : status)));
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "The install failed.");
    } finally {
      setLoadingTool(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!loadingTool}>
        <DialogHeader>
          <DialogTitle>Keep your coding tools ready</DialogTitle>
          <DialogDescription>
            Trace found tools that need attention on this computer. Install or update them to use
            them in local sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border rounded-xl border border-border">
          {statuses.map((status) => {
            const attention = needsAttention(status);
            const updating = loadingTool === status.tool;
            return (
              <div key={status.tool} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={
                    attention
                      ? "rounded-lg bg-amber-500/10 p-2 text-amber-600"
                      : "rounded-lg bg-emerald-500/10 p-2 text-emerald-600"
                  }
                >
                  {attention ? <Wrench className="size-4" /> : <Check className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{status.label}</p>
                  <p className="text-xs text-muted-foreground">{statusCopy(status)}</p>
                </div>
                {attention ? (
                  <Button
                    size="sm"
                    onClick={() => void installOrUpdate(status.tool)}
                    disabled={Boolean(loadingTool)}
                  >
                    {updating ? (
                      <RefreshCw className="size-3.5 animate-spin" />
                    ) : status.status === "missing" ? (
                      <Download className="size-3.5" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    {updating ? "Working…" : status.status === "missing" ? "Install" : "Update"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        {error ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert className="size-4" />
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
