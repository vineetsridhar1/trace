import { Monitor, RotateCw, Smartphone } from "lucide-react";
import { Button } from "../../ui/button";
import { TraceLoader } from "../../ui/trace-loader";

export function AppPreviewCanvasSkeleton({
  error,
  onRetry,
  message = "Starting preview…",
}: {
  error?: string | null;
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="flex h-full flex-col bg-surface-deep">
      <style>
        {`
          .app-preview-loading-bar {
            animation: app-preview-loading-bar 1.5s ease-in-out infinite;
          }
          @keyframes app-preview-loading-bar {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(320%); }
          }
          @media (prefers-reduced-motion: reduce) {
            .app-preview-loading-bar { animation: none; opacity: .6; }
          }
        `}
      </style>

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
          <div className="h-0.5 w-full overflow-hidden bg-border/40">
            {!error ? (
              <div className="app-preview-loading-bar h-full w-1/3 rounded-full bg-primary/80" />
            ) : (
              <div className="h-full w-full bg-destructive/50" />
            )}
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
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
              <>
                <TraceLoader size={44} showLabel={false} />
                <p className="text-xs font-medium text-muted-foreground">{message}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
