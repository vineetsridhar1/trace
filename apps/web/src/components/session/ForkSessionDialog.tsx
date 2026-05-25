import { useState } from "react";
import { FORK_SESSION_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { navigateToSession } from "../../stores/ui";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogClose as DialogClose,
} from "../ui/responsive-dialog";
import { Button } from "../ui/button";

export function ForkSessionDialog({
  eventId,
  sessionName,
  open,
  onOpenChange,
}: {
  eventId: string | null;
  sessionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) setError(null);
    if (!forking) onOpenChange(next);
  };

  const handleFork = async () => {
    if (!eventId) return;
    setForking(true);
    setError(null);
    try {
      const result = await client
        .mutation(FORK_SESSION_MUTATION, { eventId })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      const forkedSession = result.data?.forkSession;
      if (!forkedSession?.id || !forkedSession.sessionGroupId) {
        setError("Failed to fork session. Please try again.");
        return;
      }
      onOpenChange(false);
      navigateToSession(null, forkedSession.sessionGroupId, forkedSession.id);
    } catch {
      setError("Failed to fork session. Please try again.");
    } finally {
      setForking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Fork session</DialogTitle>
          <DialogDescription>
            Create a new group from <strong>{sessionName}</strong> with history copied through this
            point and a new worktree branch.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={forking} />}>
            Cancel
          </DialogClose>
          <Button disabled={forking || !eventId} onClick={handleFork}>
            {forking ? "Forking..." : "Fork"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
