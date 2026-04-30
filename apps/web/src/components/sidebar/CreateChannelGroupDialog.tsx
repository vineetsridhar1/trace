import { useEffect, useState } from "react";
import { FolderPlus } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { useAuthStore } from "@trace/client-core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
} from "../ui/responsive-dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

const CREATE_GROUP_MUTATION = gql`
  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {
    createChannelGroup(input: $input) {
      id
    }
  }
`;

interface CreateChannelGroupDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTriggerClick?: () => void;
}

export function CreateChannelGroupDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onTriggerClick,
}: CreateChannelGroupDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);

  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  useEffect(() => {
    if (open) {
      setName("");
    }
  }, [open]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrgId) return;

    setCreating(true);
    try {
      const result = await client
        .mutation(CREATE_GROUP_MUTATION, {
          input: {
            organizationId: activeOrgId,
            name: name.trim(),
          },
        })
        .toPromise();

      if (result.data?.createChannelGroup) {
        setName("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  function handleTriggerClick() {
    if (onTriggerClick) {
      onTriggerClick();
      return;
    }
    setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        className="flex cursor-pointer items-center justify-center rounded-md p-0.5 text-foreground transition-colors hover:bg-white/10"
        title="Create channel group"
        onClick={handleTriggerClick}
      >
        <FolderPlus size={16} />
      </button>
      <DialogContent>
        <form onSubmit={handleCreateGroup}>
          <DialogHeader>
            <DialogTitle>Create Channel Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Group name</label>
              <Input
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="e.g. Core Product"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !name.trim() || !activeOrgId}>
              {creating ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
