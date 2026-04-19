import { useState, useCallback, useEffect } from "react";
import { Search, Code, MessageSquare, LogIn, LogOut } from "lucide-react";
import type { ChannelType } from "@trace/gql";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { features } from "../../lib/features";
import { gql } from "@urql/core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

const ALL_CHANNELS_QUERY = gql`
  query AllChannels($organizationId: ID!) {
    channels(organizationId: $organizationId) {
      id
      name
      type
      members {
        user {
          id
        }
        joinedAt
      }
    }
  }
`;

const JOIN_CHANNEL_MUTATION = gql`
  mutation JoinChannel($channelId: ID!) {
    joinChannel(channelId: $channelId) {
      id
    }
  }
`;

const LEAVE_CHANNEL_MUTATION = gql`
  mutation LeaveChannel($channelId: ID!) {
    leaveChannel(channelId: $channelId) {
      id
    }
  }
`;

interface BrowseChannel {
  id: string;
  name: string;
  type: ChannelType;
  members: Array<{ user: { id: string }; joinedAt: string }>;
}

function ChannelTypeIcon({ type }: { type: ChannelType }) {
  if (type === "text") return <MessageSquare size={16} className="shrink-0 text-muted-foreground" />;
  return <Code size={16} className="shrink-0 text-muted-foreground" />;
}

interface BrowseChannelsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function BrowseChannelsDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger,
}: BrowseChannelsDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [channels, setChannels] = useState<BrowseChannel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedOrgId, setLoadedOrgId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const userId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    const result = await client.query(ALL_CHANNELS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.data?.channels) {
      const all = result.data.channels as BrowseChannel[];
      setChannels(features.messaging ? all : all.filter((c) => c.type !== "text"));
      setLoadedOrgId(activeOrgId);
    }
    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    if (open && activeOrgId && loadedOrgId !== activeOrgId) {
      fetchChannels();
    }
  }, [open, activeOrgId, loadedOrgId, fetchChannels]);

  useEffect(() => {
    if (activeOrgId === loadedOrgId) {
      return;
    }
    setChannels([]);
    setLoadedOrgId(null);
  }, [activeOrgId, loadedOrgId]);

  const handleJoin = async (channelId: string) => {
    setPendingAction(channelId);
    await client.mutation(JOIN_CHANNEL_MUTATION, { channelId }).toPromise();
    await fetchChannels();
    setPendingAction(null);
  };

  const handleLeave = async (channelId: string) => {
    setPendingAction(channelId);
    await client.mutation(LEAVE_CHANNEL_MUTATION, { channelId }).toPromise();
    await fetchChannels();
    setPendingAction(null);
  };

  const filtered = channels.filter((ch: BrowseChannel) =>
    ch.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger
          className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          title="Browse channels"
        >
          <Search size={16} />
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[70vh]">
        <DialogHeader>
          <DialogTitle>Browse Channels</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search channels..."
            autoFocus
          />
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {loading && (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {search ? "No channels match your search" : "No channels yet"}
              </p>
            )}
            {!loading &&
              filtered.map((ch: BrowseChannel) => {
                const isMember = ch.members.some((m: { user: { id: string } }) => m.user.id === userId);
                const isPending = pendingAction === ch.id;
                return (
                  <div
                    key={ch.id}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50"
                  >
                    <ChannelTypeIcon type={ch.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ch.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ch.members.length} {ch.members.length === 1 ? "member" : "members"}
                        {" · "}
                        {ch.type === "text" ? "Text" : "Coding"}
                      </p>
                    </div>
                    {isMember ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLeave(ch.id)}
                        disabled={isPending}
                        className="shrink-0 text-muted-foreground"
                      >
                        <LogOut size={14} className="mr-1" />
                        {isPending ? "..." : "Leave"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleJoin(ch.id)}
                        disabled={isPending}
                        className="shrink-0"
                      >
                        <LogIn size={14} className="mr-1" />
                        {isPending ? "..." : "Join"}
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
