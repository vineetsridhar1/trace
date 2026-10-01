import { cn } from "../../../lib/utils";

export function GuideGeneratingState({ fileCount }: { fileCount: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--th-review-canvas)] p-6">
      <div className="flex w-[300px] flex-col gap-2">
        <span className="text-[13px] font-semibold text-[var(--th-review-text)]">
          Writing the guide…
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          The session is reading {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>
        <div className="mt-1.5 flex flex-col gap-[7px] text-xs">
          {[
            "Reading the snapshot diff",
            "Grouping the change into chapters",
            "Writing explanations",
            "Checking file coverage",
          ].map((step, index) => (
            <span
              key={step}
              className={cn(
                "flex items-center gap-2",
                index === 0
                  ? "text-[var(--th-review-comment)]"
                  : "text-[var(--th-review-text-ghost)]",
              )}
            >
              {index === 0 ? (
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--th-accent-light)] shadow-[0_0_0_3px_rgba(96,165,250,.2)]" />
              ) : (
                <span className="size-1.5 rounded-full border border-[var(--th-review-edge-raised)]" />
              )}
              {step}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
