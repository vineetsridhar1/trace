import { useState } from "react";
import { client } from "../../lib/urql";
import { DELETE_CHANNEL_MUTATION } from "@trace/client-core";
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

export function DeleteChannelDialog({
  channelId,
  channelName,
  open,
  onOpenChange,
}: {
  channelId: string;
  channelName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) setError(null);
    onOpenChange(next);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const result = await client.mutation(DELETE_CHANNEL_MUTATION, { id: channelId }).toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
    } catch {
      setError("Failed to delete channel. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete channel</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{channelName}</strong>? This will permanently
            delete the channel and all its sessions, and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
