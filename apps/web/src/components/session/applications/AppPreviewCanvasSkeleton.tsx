import { RotateCw } from "lucide-react";
import { Button } from "../../ui/button";
import { Skeleton } from "../../ui/skeleton";

export function AppPreviewCanvasSkeleton({
  error,
  onRetry,
}: {
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-surface-deep">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-1">
          <Skeleton className="size-6 rounded" />
          <Skeleton className="size-6 rounded" />
        </div>
        <Skeleton className="size-6 rounded" />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="flex aspect-[16/10] w-[min(88%,64rem)] flex-col overflow-hidden rounded-md border border-border bg-background shadow-2xl">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
            <Skeleton className="size-3 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-3/5" />
            <div className="grid flex-1 grid-cols-3 gap-4 pt-2">
              <Skeleton className="h-full rounded-lg" />
              <Skeleton className="h-full rounded-lg" />
              <Skeleton className="h-full rounded-lg" />
            </div>
          </div>
        </div>
        {error ? (
          <div className="absolute bottom-5 flex items-center gap-2 rounded-md border border-destructive/30 bg-background/95 px-3 py-2 shadow-lg">
            <span className="max-w-md truncate text-xs text-destructive">{error}</span>
            {onRetry ? (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCw size={12} />
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
