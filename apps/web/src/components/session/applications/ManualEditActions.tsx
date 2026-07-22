import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TraceLoader } from "@/components/ui/trace-loader";
import { cn } from "@/lib/utils";

export function ManualEditActions({
  enabled,
  frameReady,
  saving,
  onPrimaryAction,
  onDiscard,
  className,
}: {
  enabled: boolean;
  frameReady: boolean;
  saving: boolean;
  onPrimaryAction: () => void;
  onDiscard: () => void;
  className?: string;
}) {
  if (!enabled) {
    return (
      <Button
        size="sm"
        onClick={onPrimaryAction}
        title="Edit manually"
        aria-label="Edit manually"
        className={cn(
          "h-7 cursor-pointer rounded-md border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-foreground shadow-lg shadow-black/20 backdrop-blur-md hover:bg-surface-hover",
          className,
        )}
      >
        <Pencil size={13} className="text-amber-300" />
        Edit
      </Button>
    );
  }

  const pending = saving || !frameReady;
  const primaryLabel = saving ? "Saving…" : frameReady ? "Done" : "Connecting…";

  return (
    <div
      role="group"
      aria-label="Manual editing actions"
      className={cn(
        "flex h-8 items-center gap-0.5 rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-lg shadow-black/20 backdrop-blur-md",
        className,
      )}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={onDiscard}
        disabled={saving}
        className="h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      >
        Discard
      </Button>
      <Button
        size="sm"
        onClick={onPrimaryAction}
        disabled={pending}
        title={frameReady ? "Save edits" : "Connecting to preview"}
        className="h-7 cursor-pointer rounded-md border border-border/70 bg-background/40 px-2.5 text-xs font-medium text-foreground hover:bg-surface-hover"
      >
        {pending ? (
          <TraceLoader size={13} showLabel={false} />
        ) : (
          <Check size={13} className="text-amber-300" />
        )}
        {primaryLabel}
      </Button>
    </div>
  );
}
