import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogClose as DialogClose,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";

const UPDATE_CHANNEL_GROUP_MUTATION = gql`
  mutation RenameChannelGroup($id: ID!, $input: UpdateChannelGroupInput!) {
    updateChannelGroup(id: $id, input: $input) {
      id
    }
  }
`;

export function RenameProjectGroupDialog({
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
  const [name, setName] = useState(groupName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(groupName);
      setError(null);
    }
  }, [groupName, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a project group name.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(UPDATE_CHANNEL_GROUP_MUTATION, { id: groupId, input: { name: trimmedName } })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      onOpenChange(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to rename project group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Rename project group</DialogTitle>
            <DialogDescription>Choose a clear name for this project group.</DialogDescription>
          </DialogHeader>
          <div className="py-5">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Project group name"
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
