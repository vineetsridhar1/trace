import { useEffect, useState } from "react";
import { Code, FolderPlus, Plus } from "lucide-react";
import type { ChannelVisibility } from "@trace/gql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useIsMobile } from "../../hooks/use-mobile";
import { client } from "../../lib/urql";
import { useAuthStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";

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
  hideTrigger?: boolean;
  onTriggerClick?: () => void;
}

export function CreateChannelDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultGroupId,
  hideTrigger = false,
  onTriggerClick,
}: CreateChannelDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [mode, setMode] = useState<CreateMode>("choose");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<ChannelVisibility>("public");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;

    setMode(defaultGroupId ? "channel" : "choose");
    setName("");
    setVisibility("public");
    setError(null);
  }, [open, defaultGroupId]);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrgId) return;

    setCreating(true);
    setError(null);
    try {
      const result = await client
        .mutation(CREATE_CHANNEL_MUTATION, {
          input: {
            organizationId: activeOrgId,
            name: name.trim(),
            type: "coding",
            visibility,
            groupId: defaultGroupId ?? null,
          },
        })
        .toPromise();

      if (result.error) throw result.error;

      const newChannelId = result.data?.createChannel?.id as string | undefined;
      setName("");
      setVisibility("public");
      setOpen(false);
      if (newChannelId) {
        useUIStore.getState().setActiveChannelId(newChannelId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrgId) return;

    setCreating(true);
    setError(null);
    try {
      const result = await client
        .mutation(CREATE_GROUP_MUTATION, {
          input: {
            organizationId: activeOrgId,
            name: name.trim(),
          },
        })
        .toPromise();

      if (result.error) throw result.error;

      if (result.data?.createChannelGroup) {
        setName("");
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel group");
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

  const canCreateChannel = Boolean(name.trim()) && Boolean(activeOrgId) && !creating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <button
          className="flex cursor-pointer items-center justify-center rounded-md p-0.5 text-foreground transition-colors hover:bg-white/10"
          title="Create project or group"
          onClick={handleTriggerClick}
        >
          <Plus size={16} />
        </button>
      )}
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
                <Code size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Project</p>
                  <p className="text-xs text-muted-foreground">
                    Create a new project for messaging or sessions
                  </p>
                </div>
              </button>
              <button
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-elevated"
                onClick={() => setMode("group")}
              >
                <FolderPlus size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Project Group</p>
                  <p className="text-xs text-muted-foreground">
                    Organize projects into collapsible groups
                  </p>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === "channel" && (
          <form onSubmit={handleCreateChannel}>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Project name</label>
                <Input
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  placeholder="e.g. general"
                  autoFocus={!isMobile}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Visibility</label>
                <Select
                  value={visibility}
                  onValueChange={(value: ChannelVisibility | null) => {
                    if (value) setVisibility(value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              {!defaultGroupId && (
                <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
                  Back
                </Button>
              )}
              <Button type="submit" disabled={!canCreateChannel}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {mode === "group" && (
          <form onSubmit={handleCreateGroup}>
            <DialogHeader>
              <DialogTitle>Create Project Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Group name</label>
                <Input
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  placeholder="e.g. Engineering"
                  autoFocus={!isMobile}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button type="submit" disabled={!name.trim() || creating || !activeOrgId}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
