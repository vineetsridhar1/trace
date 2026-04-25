import { useState } from "react";
import { client } from "../../lib/urql";
import { ARCHIVE_SESSION_GROUP_MUTATION } from "@trace/client-core";
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

export function ArchiveSessionGroupDialog({
  groupId,
  groupName,
  open,
  onOpenChange,
}: {
  groupId: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) setError(null);
    onOpenChange(next);
  };

  const handleArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      const result = await client.mutation(ARCHIVE_SESSION_GROUP_MUTATION, { id: groupId }).toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
    } catch {
      setError("Failed to archive workspace. Please try again.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Archive workspace</DialogTitle>
          <DialogDescription>
            Archive <strong>{groupName}</strong>? This will stop all agents and
            unload the worktree. Empty workspaces are deleted instead of moved
            to Merged & Archived.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={archiving} onClick={handleArchive}>
            {archiving ? "Archiving..." : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
