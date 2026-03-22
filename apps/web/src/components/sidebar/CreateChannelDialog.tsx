import { useState, useEffect } from "react";
import { Plus, Hash, FolderPlus } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
} from "../ui/responsive-dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

const CREATE_CHANNEL_MUTATION = gql`
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      id
    }
  }
`;

const CREATE_GROUP_MUTATION = gql`
  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {
    createChannelGroup(input: $input) {
      id
    }
  }
`;

type CreateMode = "choose" | "channel" | "group";

interface CreateChannelDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultGroupId?: string | null;
  onTriggerClick?: () => void;
}

export function CreateChannelDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultGroupId,
  onTriggerClick,
}: CreateChannelDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [mode, setMode] = useState<CreateMode>("choose");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const isMobile = useIsMobile();

  // When opening with a defaultGroupId, go straight to channel creation
  useEffect(() => {
    if (open) {
      if (defaultGroupId) {
        setMode("channel");
      } else {
        setMode("choose");
      }
      setName("");
    }
  }, [open, defaultGroupId]);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrgId) return;

    setCreating(true);
    try {
      const result = await client
        .mutation(CREATE_CHANNEL_MUTATION, {
          input: {
            organizationId: activeOrgId,
            name: name.trim(),
            groupId: defaultGroupId ?? null,
          },
        })
        .toPromise();

      if (result.data?.createChannel) {
        setName("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

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
    } else {
      setOpen(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        title="Create channel or group"
        onClick={handleTriggerClick}
      >
        <Plus size={16} />
      </button>
      <DialogContent>
        {mode === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>Create New</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-4">
              <button
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-elevated"
                onClick={() => setMode("channel")}
              >
                <Hash size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Channel</p>
                  <p className="text-xs text-muted-foreground">Create a new channel for messaging and sessions</p>
                </div>
              </button>
              <button
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-elevated"
                onClick={() => setMode("group")}
              >
                <FolderPlus size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Channel Group</p>
                  <p className="text-xs text-muted-foreground">Organize channels into collapsible groups</p>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === "channel" && (
          <form onSubmit={handleCreateChannel}>
            <DialogHeader>
              <DialogTitle>Create Channel</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <label className="mb-1.5 block text-sm text-muted-foreground">Channel name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. general"
                autoFocus={!isMobile}
              />
            </div>
            <DialogFooter>
              {!defaultGroupId && (
                <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
                  Back
                </Button>
              )}
              <Button type="submit" disabled={!name.trim() || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {mode === "group" && (
          <form onSubmit={handleCreateGroup}>
            <DialogHeader>
              <DialogTitle>Create Channel Group</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <label className="mb-1.5 block text-sm text-muted-foreground">Group name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Engineering"
                autoFocus={!isMobile}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button type="submit" disabled={!name.trim() || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
