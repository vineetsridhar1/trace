import { useState } from "react";
import { SAVE_SESSION_GROUP_FOR_LATER_MUTATION } from "@trace/client-core";
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

export function SaveSessionGroupForLaterDialog({
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) setError(null);
    onOpenChange(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(SAVE_SESSION_GROUP_FOR_LATER_MUTATION, { id: groupId })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      handleOpenChange(false);
    } catch {
      setError("Failed to save workspace for later. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save for later</DialogTitle>
          <DialogDescription>
            Move <strong>{groupName}</strong> out of the active channel list. It will stay in Later
            without archiving or unloading the workspace.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save for later"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
