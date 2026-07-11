import { Monitor, RotateCw, Smartphone } from "lucide-react";
import { Button } from "../../ui/button";
import { AppPreviewLoadingBar } from "./AppPreviewLoadingBar";

/**
 * Loading state shown once the app server is ready to serve and the preview is
 * genuinely being fetched (creating the preview URL, loading the iframe, or
 * reloading). Mirrors AppPreviewCanvas's chrome so the swap to the live frame is
 * seamless, and drives motion with an indeterminate progress bar under the
 * address bar. For the "app is still building" phase, use AppPreviewCanvasSkeleton.
 */
export function AppPreviewCanvasLoader({
  error,
  onRetry,
  message = "Loading app…",
}: {
  error?: string | null;
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="flex h-full flex-col bg-surface-deep">
      {/* Toolbar — mirrors AppPreviewCanvas so the swap to the live frame is seamless. */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs tabular-nums text-muted-foreground/40">—— × ——</span>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5 opacity-50">
          <span className="flex size-6 items-center justify-center text-muted-foreground">
            <Monitor size={13} />
          </span>
          <span className="flex size-6 items-center justify-center text-muted-foreground">
            <Smartphone size={13} />
          </span>
        </div>
        <Button size="icon-xs" variant="ghost" disabled title="Reload preview">
          <RotateCw size={13} />
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="flex aspect-[16/10] w-[min(88%,64rem)] flex-col overflow-hidden rounded-md border border-border bg-background shadow-2xl">
          {/* Fake browser chrome */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-muted" />
              <span className="size-2.5 rounded-full bg-muted" />
              <span className="size-2.5 rounded-full bg-muted" />
            </div>
            <div className="ml-2 h-4 flex-1 rounded-full bg-muted/50" />
          </div>

          {/* Indeterminate loading bar under the address bar */}
          <AppPreviewLoadingBar error={Boolean(error)} />

          {/* Content */}
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            {error ? (
              <>
                <p className="max-w-md text-sm font-medium text-foreground">
                  Couldn&apos;t load the preview
                </p>
                <p className="max-w-md text-xs text-destructive">{error}</p>
                {onRetry ? (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    <RotateCw size={12} className="mr-1" />
                    Retry
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="text-xs font-medium text-muted-foreground">{message}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
