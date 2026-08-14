import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function AppUpdateSidebarItem() {
  const [status, setStatus] = useState<DesktopAppUpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [openingDownload, setOpeningDownload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getStatus = window.trace?.getAppUpdateStatus;
    if (!getStatus) return;

    let cancelled = false;
    void getStatus()
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch(() => {
        // Release checks are best effort and should stay invisible when unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status?.state !== "update_available" || !status.latestVersion) return null;

  async function openDownload() {
    if (!window.trace?.openAppUpdateDownload || openingDownload) return;
    setOpeningDownload(true);
    setError(null);
    try {
      const opened = await window.trace.openAppUpdateDownload();
      if (!opened) throw new Error("The download could not be opened.");
      setOpen(false);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The download failed.");
    } finally {
      setOpeningDownload(false);
    }
  }

  return (
    <div className="border-t border-[#3f3f46] px-2 py-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-[#3f3f46] bg-[#09090b] text-[#fafafa]">
            <Download className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-[#fafafa]">
              Trace update
            </span>
            <span className="mt-px flex items-center gap-1 text-[11px] font-medium text-[#f59e0b]">
              <span aria-hidden="true">↑</span>
              Version {status.latestVersion} available
            </span>
          </span>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={6}
          className="w-[var(--anchor-width)] gap-0 overflow-hidden rounded-[12px] border border-[#3f3f46] bg-[#18181b] p-0 text-[#fafafa] shadow-[0_16px_48px_rgb(0_0_0/0.24)]"
        >
          <div className="px-4 pb-3 pt-3.5">
            <p className="text-[13px] font-semibold">A newer Trace app is available</p>
            <p className="mt-1 text-xs leading-5 text-[#a1a1aa]">
              You’re running {status.currentVersion}. Download {status.latestVersion} and replace
              your current app after it finishes.
            </p>
            {error ? <p className="mt-2 text-xs text-[#ef4444]">{error}</p> : null}
          </div>
          <div className="border-t border-[#3f3f46] p-3">
            <button
              type="button"
              disabled={openingDownload}
              onClick={() => void openDownload()}
              className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-[#fafafa] px-3 text-[13px] font-semibold text-[#09090b] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6] disabled:opacity-50"
            >
              <Download className="size-3.5" />
              {openingDownload
                ? "Opening…"
                : status.directDownload
                  ? `Download Trace ${status.latestVersion}`
                  : "View release downloads"}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
