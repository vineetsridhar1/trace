import { useState } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { ActionTooltip } from "@/components/ui/ActionTooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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
    <>
      <div
        role="group"
        aria-label="Manual editing actions"
        className={cn("flex h-8 items-center gap-1", className)}
      >
        <ActionTooltip label="Discard all unsaved edits">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => setConfirmDiscard(true)}
            disabled={saving}
            aria-label="Discard all unsaved edits"
            className="cursor-pointer border-border/70 bg-background/70 text-muted-foreground shadow-lg shadow-black/20 backdrop-blur-md hover:bg-surface-hover hover:text-foreground"
          >
            <RotateCcw size={13} />
          </Button>
        </ActionTooltip>
        <Button
          size="sm"
          onClick={onPrimaryAction}
          disabled={pending}
          title={frameReady ? "Save edits" : "Connecting to preview"}
          className="h-7 cursor-pointer rounded-md border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-foreground shadow-lg shadow-black/20 backdrop-blur-md hover:bg-surface-hover"
        >
          {pending ? (
            <TraceLoader size={13} showLabel={false} />
          ) : (
            <Check size={13} className="text-amber-300" />
          )}
          {primaryLabel}
        </Button>
      </div>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard manual edits?</DialogTitle>
            <DialogDescription>
              This will revert every unsaved manual edit from this editing session. Your last saved
              version will not be changed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false);
                onDiscard();
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
