import { useState } from "react";
import { DELETE_SESSION_GROUP_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogClose as DialogClose,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";

export function DeleteAppDialog({
  appId,
  appName,
  open,
  onOpenChange,
}: {
  appId: string;
  appName: string;
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
      const result = await client
        .mutation(DELETE_SESSION_GROUP_MUTATION, { id: appId })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
    } catch {
      setError("Failed to delete app. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete app</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{appName}</strong>? This permanently deletes its
            sessions and managed git repository and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
            {deleting ? "Deleting..." : "Delete app"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
