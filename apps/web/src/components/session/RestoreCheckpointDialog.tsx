import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

const DISMISS_KEY = "trace:restore-checkpoint-dismiss";

interface RestoreCheckpointDialogProps {
  open: boolean;
  commitSha: string;
  subject: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function shouldShowRestoreDialog(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) !== "true";
  } catch {
    return true;
  }
}

export function RestoreCheckpointDialog({
  open,
  commitSha,
  subject,
  onConfirm,
  onCancel,
}: RestoreCheckpointDialogProps) {
  const [dontShow, setDontShow] = useState(false);

  function handleConfirm() {
    if (dontShow) {
      try {
        localStorage.setItem(DISMISS_KEY, "true");
      } catch {
        // ignore
      }
    }
    onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw size={16} className="text-muted-foreground" />
            Restore Checkpoint
          </DialogTitle>
          <DialogDescription>
            This will create a <strong>new session</strong> starting from commit{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
              {commitSha}
            </code>
            {subject && (
              <span className="text-muted-foreground"> — {subject}</span>
            )}
            . Your current work will not be lost.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDontShow(e.target.checked)}
            className="rounded border-border"
          />
          Don&apos;t show this again
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
