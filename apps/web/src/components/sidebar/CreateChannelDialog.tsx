import { useState, useEffect } from "react";
import { Plus, Code, MessageSquare, FolderPlus } from "lucide-react";
import type { ChannelType } from "@trace/gql";
import { useIsMobile } from "../../hooks/use-mobile";
import { useAuthStore } from "../../stores/auth";
import { useUIStore } from "../../stores/ui";
import { useEntityIds, useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
} from "../ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
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

const TYPE_OPTIONS: Array<{ value: ChannelType; label: string; description: string; icon: typeof Code }> = [
  { value: "coding", label: "Coding", description: "For AI coding sessions", icon: Code },
  { value: "text", label: "Text", description: "For team messaging", icon: MessageSquare },
];

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
  const [channelType, setChannelType] = useState<ChannelType>("coding");
  const [repoId, setRepoId] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const repoIds = useEntityIds("repos");
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
      setChannelType("coding");
      setRepoId(undefined);
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
            type: channelType,
            repoId,
            groupId: defaultGroupId ?? null,
          },
        })
        .toPromise();

      if (result.data?.createChannel) {
        const newChannelId = result.data.createChannel.id as string;
        setName("");
        setChannelType("coding");
        setRepoId(undefined);
        setOpen(false);
        useUIStore.getState().setActiveChannelId(newChannelId);
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
                <Code size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Channel</p>
                  <p className="text-xs text-muted-foreground">Create a new channel for messaging or sessions</p>
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
            <div className="space-y-4 py-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Channel name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. general"
                  autoFocus={!isMobile}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Channel type</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = channelType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setChannelType(opt.value);
                          if (opt.value === "text") setRepoId(undefined);
                        }}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <Icon size={20} />
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {channelType === "coding" && (
                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">Repository</label>
                  {repoIds.length > 0 ? (
                    <Select
                      value={repoId ?? ""}
                      onValueChange={(v) => setRepoId(v || undefined)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a repo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {repoIds.map((id) => (
                          <RepoOptionItem key={id} id={id} />
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Link a repository to your organization first.
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              {!defaultGroupId && (
                <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
                  Back
                </Button>
              )}
              <Button type="submit" disabled={!name.trim() || creating || (channelType === "coding" && !repoId)}>
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

function RepoOptionItem({ id }: { id: string }) {
  const name = useEntityField("repos", id, "name");
  return <SelectItem value={id}>{name ?? id}</SelectItem>;
}
