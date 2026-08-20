import { useCallback, useEffect, useState } from "react";
import { Code, Lock, LogIn, LogOut, MessageSquare, Search } from "lucide-react";
import { gql } from "@urql/core";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { features } from "../../lib/features";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { updateBrowseChannelMembership, type BrowseChannel } from "./browse-channel-membership";

const ALL_CHANNELS_QUERY = gql`
  query AllChannels($organizationId: ID!) {
    channels(organizationId: $organizationId) {
      id
      name
      type
      visibility
      memberCount
      viewerIsMember
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

interface BrowseChannelsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

function ChannelTypeIcon({ type }: { type: BrowseChannel["type"] }) {
  const Icon = type === "text" ? MessageSquare : Code;
  return <Icon size={17} className="shrink-0 text-muted-foreground" />;
}

function membershipLabel(channel: BrowseChannel) {
  return `${channel.memberCount} ${channel.memberCount === 1 ? "member" : "members"}`;
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
  const [error, setError] = useState<string | null>(null);
  const activeOrgId = useAuthStore((state: { activeOrgId: string | null }) => state.activeOrgId);

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client
        .query(ALL_CHANNELS_QUERY, { organizationId: activeOrgId })
        .toPromise();
      if (result.error) throw result.error;
      const all = (result.data?.channels ?? []) as BrowseChannel[];
      setChannels(features.messaging ? all : all.filter((channel) => channel.type !== "text"));
      setLoadedOrgId(activeOrgId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load channels.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (open && activeOrgId && loadedOrgId !== activeOrgId) void fetchChannels();
  }, [activeOrgId, fetchChannels, loadedOrgId, open]);

  useEffect(() => {
    if (activeOrgId === loadedOrgId) return;
    setChannels([]);
    setLoadedOrgId(null);
  }, [activeOrgId, loadedOrgId]);

  const updateMembership = useCallback(
    async (channelId: string, joining: boolean) => {
      const previousChannels = channels;
      setPendingAction(channelId);
      setError(null);
      setChannels((current) => updateBrowseChannelMembership(current, channelId, joining));

      try {
        const result = await client
          .mutation(joining ? JOIN_CHANNEL_MUTATION : LEAVE_CHANNEL_MUTATION, { channelId })
          .toPromise();
        if (result.error) throw result.error;
      } catch (reason) {
        setChannels(previousChannels);
        setError(reason instanceof Error ? reason.message : "Unable to update channel membership.");
      } finally {
        setPendingAction(null);
      }
    },
    [channels],
  );

  const filteredChannels = channels.filter((channel) =>
    channel.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger
          className="flex cursor-pointer items-center justify-center rounded-md p-0.5 text-foreground transition-colors hover:bg-white/10"
          title="Browse channels"
        >
          <Search size={16} />
        </DialogTrigger>
      )}
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Browse channels</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Find projects to join, or manage the ones you already follow.
          </p>
        </DialogHeader>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search channels"
              autoFocus
              className="bg-surface-deep pl-9 text-foreground"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            {loading && (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading channels…</p>
            )}
            {!loading && filteredChannels.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {search ? "No channels match your search." : "No channels are available yet."}
              </p>
            )}
            {!loading && filteredChannels.length > 0 && (
              <ul className="space-y-2" aria-label="Channels">
                {filteredChannels.map((channel) => {
                  const isPending = pendingAction === channel.id;
                  return (
                    <li
                      key={channel.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                        <ChannelTypeIcon type={channel.type} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {channel.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {membershipLabel(channel)} · {channel.type === "text" ? "Text" : "Coding"}
                          {channel.visibility === "private" && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <Lock size={11} className="inline align-[-1px]" /> Private
                            </>
                          )}
                        </p>
                      </div>
                      <Button
                        variant={channel.viewerIsMember ? "ghost" : "outline"}
                        size="sm"
                        disabled={pendingAction !== null}
                        onClick={() => void updateMembership(channel.id, !channel.viewerIsMember)}
                        className="shrink-0"
                      >
                        {channel.viewerIsMember ? <LogOut size={14} /> : <LogIn size={14} />}
                        {isPending ? "Updating…" : channel.viewerIsMember ? "Leave" : "Join"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
