import { Skeleton } from "../../ui/skeleton";
import { cn } from "../../../lib/utils";

export function SavedPreviewSkeleton({
  className,
  kind,
}: {
  className?: string;
  kind: "design" | "pdf";
}) {
  const isDocument = kind === "pdf";

  return (
    <div
      className={cn(
        "relative flex size-full items-center justify-center overflow-hidden bg-[#111113] p-8",
        className,
      )}
      style={{
        backgroundImage: "radial-gradient(rgba(113, 113, 122, 0.3) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {isDocument ? (
        <div className="flex max-h-full w-[min(78%,34rem)] flex-col gap-5 overflow-hidden">
          {[0, 1].map((page) => (
            <div
              key={page}
              className="aspect-[8.5/11] w-full shrink-0 rounded-md border border-border bg-background/85 p-[9%] shadow-2xl"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-8 h-6 w-3/4" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-5/6" />
              <div className="mt-8 grid grid-cols-2 gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
              <Skeleton className="mt-8 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex aspect-[16/10] w-[min(88%,64rem)] flex-col overflow-hidden rounded-md border border-border bg-background shadow-2xl">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
            <Skeleton className="size-3 rounded-full" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
          <div className="grid flex-1 grid-cols-[22%_1fr]">
            <div className="border-r border-border p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-5 h-7 w-full" />
              <Skeleton className="mt-3 h-7 w-4/5" />
              <Skeleton className="mt-3 h-7 w-full" />
            </div>
            <div className="p-6">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="mt-4 h-4 w-3/5" />
              <div className="mt-8 grid grid-cols-3 gap-4">
                <Skeleton className="h-28 rounded-lg" />
                <Skeleton className="h-28 rounded-lg" />
                <Skeleton className="h-28 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
