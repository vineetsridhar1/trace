import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Code, FolderPlus, MessageSquare, Plus } from "lucide-react";
import type { ChannelType, CodingTool, SessionRuntimeInstance } from "@trace/gql";
import { gql } from "@urql/core";
import { BranchCombobox } from "../channel/BranchCombobox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AVAILABLE_RUNTIMES_QUERY } from "@trace/client-core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useIsMobile } from "../../hooks/use-mobile";
import { client } from "../../lib/urql";
import { features } from "../../lib/features";
import { useAuthStore } from "@trace/client-core";
import { useEntityField, useEntityIds } from "@trace/client-core";
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

const CODING_CHANNEL_TOOL: CodingTool = "claude_code";

const ALL_TYPE_OPTIONS: Array<{
  value: ChannelType;
  label: string;
  description: string;
  icon: typeof Code;
}> = [
  { value: "coding", label: "Coding", description: "For AI coding sessions", icon: Code },
  { value: "text", label: "Text", description: "For team messaging", icon: MessageSquare },
];

const TYPE_OPTIONS = features.messaging
  ? ALL_TYPE_OPTIONS
  : ALL_TYPE_OPTIONS.filter((o) => o.value !== "text");

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
  const [baseBranch, setBaseBranch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const repoIds = useEntityIds("repos");
  const isMobile = useIsMobile();
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);

  useEffect(() => {
    if (!open) return;

    setMode(defaultGroupId ? "channel" : "choose");
    setName("");
    setChannelType("coding");
    setRepoId(undefined);
    setBaseBranch("");
    setError(null);
  }, [open, defaultGroupId]);

  useEffect(() => {
    if (!open || channelType !== "coding") return;
    let cancelled = false;
    client
      .query(AVAILABLE_RUNTIMES_QUERY, { tool: CODING_CHANNEL_TOOL, sessionGroupId: null })
      .toPromise()
      .then((result: { data?: { availableRuntimes?: SessionRuntimeInstance[] } }) => {
        if (cancelled) return;
        setRuntimes(result.data?.availableRuntimes ?? []);
      })
      .catch(() => {
        if (!cancelled) setRuntimes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, channelType]);

  // Repos already cloned on at least one connected local bridge. When no local
  // bridge is connected we skip the filter so cloud-only users can still pick
  // any repo (cloud clones on demand).
  const clonedRepoIds = useMemo(() => {
    const set = new Set<string>();
    for (const runtime of runtimes) {
      for (const id of runtime.registeredRepoIds) set.add(id);
    }
    return set;
  }, [runtimes]);
  const hasLocalBridge = runtimes.length > 0;
  const isRepoCloned = (id: string) => !hasLocalBridge || clonedRepoIds.has(id);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrgId || (channelType === "coding" && !repoId)) return;

    setCreating(true);
    setError(null);
    try {
      const result = await client
        .mutation(CREATE_CHANNEL_MUTATION, {
          input: {
            organizationId: activeOrgId,
            name: name.trim(),
            type: channelType,
            repoId,
            baseBranch: baseBranch || undefined,
            groupId: defaultGroupId ?? null,
          },
        })
        .toPromise();

      if (result.error) throw result.error;

      const newChannelId = result.data?.createChannel?.id as string | undefined;
      setName("");
      setChannelType("coding");
      setRepoId(undefined);
      setBaseBranch("");
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

  const canCreateChannel =
    Boolean(name.trim()) &&
    Boolean(activeOrgId) &&
    !creating &&
    (channelType === "text" || Boolean(repoId));

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
                  <p className="text-xs text-muted-foreground">
                    Create a new channel for messaging or sessions
                  </p>
                </div>
              </button>
              <button
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-elevated"
                onClick={() => setMode("group")}
              >
                <FolderPlus size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Channel Group</p>
                  <p className="text-xs text-muted-foreground">
                    Organize channels into collapsible groups
                  </p>
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  placeholder="e.g. general"
                  autoFocus={!isMobile}
                />
              </div>
              {TYPE_OPTIONS.length > 1 && (
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
                          setError(null);
                          if (opt.value === "text") {
                            setRepoId(undefined);
                            setBaseBranch("");
                          }
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
              )}
              {channelType === "coding" && (
                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">Repository</label>
                  {repoIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Link a repository to your organization first.
                    </p>
                  ) : (
                    <Select
                      value={repoId ?? "__none__"}
                      onValueChange={(value: string | null) => {
                        setRepoId(value && value !== "__none__" ? value : undefined);
                        setBaseBranch("");
                        setError(null);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          <SelectedRepoValue id={repoId} />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a repo...</SelectItem>
                        {repoIds.map((id) => (
                          <RepoOptionItem key={id} id={id} disabled={!isRepoCloned(id)} />
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {channelType === "coding" && repoId && (
                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">Base branch</label>
                  <BranchCombobox repoId={repoId} value={baseBranch} onChange={setBaseBranch} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sessions in this channel will merge into this branch.
                  </p>
                </div>
              )}
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
              <DialogTitle>Create Channel Group</DialogTitle>
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

function SelectedRepoValue({ id }: { id: string | undefined }) {
  const name = useEntityField("repos", id ?? "", "name");
  return <>{id ? name ?? id : "Select a repo..."}</>;
}

function RepoOptionItem({ id, disabled }: { id: string; disabled?: boolean }) {
  const name = useEntityField("repos", id, "name");
  return (
    <SelectItem value={id} disabled={disabled}>
      <span className="flex items-center gap-1.5">
        {name ?? id}
        {disabled && (
          <span className="flex items-center gap-0.5 text-xs text-amber-500">
            <AlertTriangle size={10} />
            not cloned
          </span>
        )}
      </span>
    </SelectItem>
  );
}
