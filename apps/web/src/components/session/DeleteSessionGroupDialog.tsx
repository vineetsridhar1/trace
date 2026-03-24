import { useState } from "react";
import { client } from "../../lib/urql";
import { DELETE_SESSION_GROUP_MUTATION } from "../../lib/mutations";
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

export function DeleteSessionGroupDialog({
  groupId,
  groupName,
  sessionCount,
  open,
  onOpenChange,
}: {
  groupId: string;
  groupName: string;
  sessionCount: number;
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
      const result = await client.mutation(DELETE_SESSION_GROUP_MUTATION, { id: groupId }).toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
    } catch {
      setError("Failed to delete workspace. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete workspace</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{groupName}</strong>? This will
            delete {sessionCount === 1 ? "1 session" : `all ${sessionCount} sessions`} in
            this workspace and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
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
