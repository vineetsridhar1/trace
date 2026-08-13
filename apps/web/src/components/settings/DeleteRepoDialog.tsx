import { useState } from "react";
import { DELETE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";

export function DeleteRepoDialog({
  repoId,
  repoName,
  open,
  onOpenChange,
}: {
  repoId: string;
  repoName: string;
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
      const result = await client.mutation(DELETE_REPO_MUTATION, { id: repoId }).toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
    } catch {
      setError("Failed to delete repository. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete repository</DialogTitle>
          <DialogDescription>
            Remove <strong>{repoName}</strong> from Trace? Existing sessions, channels, and projects
            are retained but will no longer be linked to this repository. Remote and local files are
            not deleted.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p aria-live="polite" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
            {deleting ? "Deleting…" : "Delete repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
