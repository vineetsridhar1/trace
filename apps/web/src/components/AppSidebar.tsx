import { useState, useEffect, useCallback } from "react";
import { Hash, Plus, Settings, LogOut, ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Channel } from "@trace/gql";
import { useAuthStore } from "../stores/auth";
import { useEntityStore } from "../stores/entity";
import { client } from "../lib/urql";
import { gql } from "@urql/core";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "./ui/sidebar";

const CHANNELS_QUERY = gql`
  query Channels($organizationId: ID!) {
    channels(organizationId: $organizationId) {
      id
      name
      type
    }
  }
`;

const CREATE_CHANNEL_MUTATION = gql`
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      id
      name
      type
    }
  }
`;

function getInitials(name: string): string {
  return name
    .split(/[\s']+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function OrgSwitcher({ large }: { large?: boolean }) {
  const organizations = useEntityStore((s) => s.organizations);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const setActiveOrg = useAuthStore((s) => s.setActiveOrg);

  const activeOrg = activeOrgId ? organizations[activeOrgId] : null;
  const orgList = Object.values(organizations);

  return (
    <Popover>
      <PopoverTrigger
        className={`flex h-full w-full cursor-pointer items-center gap-2 px-3 transition-colors hover:bg-surface-elevated ${large ? "py-2.5" : ""}`}
      >
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg bg-accent font-bold text-accent-foreground ${large ? "h-7.5 w-7.5 text-xs" : "h-7 w-7 text-xs"}`}
        >
          {getInitials(activeOrg?.name ?? "")}
        </div>
        <span
          className={`flex-1 truncate text-left font-semibold text-foreground ${large ? "text-[15px]" : "text-sm"}`}
        >
          {activeOrg?.name ?? "Workspace"}
        </span>
        <ChevronDown size={large ? 15 : 14} className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" sideOffset={4} className="!w-56 gap-0 p-1.5">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Switch server</p>
        {orgList.map((org) => (
          <button
            key={org.id}
            onClick={() => setActiveOrg(org.id)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-[10px] font-semibold text-muted-foreground">
              {getInitials(org.name)}
            </div>
            <span className="flex-1 truncate">{org.name}</span>
            {org.id === activeOrgId && <Check size={14} className="text-accent" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <Popover>
      <PopoverTrigger className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-surface-elevated">
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="relative shrink-0 overflow-hidden rounded-full"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated text-[10px] font-semibold text-muted-foreground">
              {getInitials(user?.name ?? "")}
            </div>
          )}
        </motion.div>
        <span className="flex-1 truncate text-left text-sm text-foreground">{user?.name}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={4} className="w-56 gap-0 p-1.5">
        <div className="border-b border-border px-2 py-1.5 mb-1">
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <button className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-hover">
          <Settings size={16} className="text-muted-foreground" />
          Settings
        </button>
        <button
          onClick={logout}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-surface-hover"
        >
          <LogOut size={16} />
          Log out
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ChannelItem({
  id,
  isActive,
  onClick,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = useEntityStore((s) => (s.channels[id] as { name?: string } | undefined)?.name);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} onClick={onClick} tooltip={name ?? ""}>
        <Hash size={16} className="opacity-50" />
        <span>{name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function CreateChannelDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrgId) return;

    setCreating(true);
    try {
      const result = await client
        .mutation(CREATE_CHANNEL_MUTATION, {
          input: { organizationId: activeOrgId, name: name.trim() },
        })
        .toPromise();

      if (result.data?.createChannel) {
        const channel = result.data.createChannel;
        useEntityStore.getState().upsert("channels", channel.id, channel);
        setName("");
        setOpen(false);
        onCreated();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        title="Create channel"
      >
        <Plus size={16} />
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="mb-1.5 block text-sm text-muted-foreground">Channel name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. general"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shared sidebar content used by both the pinned sidebar and the peek overlay */
function SidebarBody({
  sortedIds,
  activeChannelId,
  setActiveChannelId,
  fetchChannels,
}: {
  sortedIds: string[];
  activeChannelId: string | null;
  setActiveChannelId: (id: string) => void;
  fetchChannels: () => void;
}) {
  return (
    <>
      <SidebarHeader className="h-12 p-0 border-b border-border">
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between pr-1">
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Channels
            </SidebarGroupLabel>
            <CreateChannelDialog onCreated={fetchChannels} />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {sortedIds.map((id) => (
                <ChannelItem
                  key={id}
                  id={id}
                  isActive={id === activeChannelId}
                  onClick={() => setActiveChannelId(id)}
                />
              ))}
            </SidebarMenu>

            {sortedIds.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No channels yet</p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-0 border-t border-border">
        <UserMenu />
      </SidebarFooter>
    </>
  );
}

export function AppSidebar() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const channels = useEntityStore((s) => s.channels);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [peeking, setPeeking] = useState(false);
  const { state } = useSidebar();

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHANNELS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.channels) {
      const fetched = result.data.channels as Array<{
        id: string;
        name: string;
        type: string;
      }>;
      upsertMany("channels", fetched as Array<Channel & { id: string }>);
      setChannelIds(fetched.map((c) => c.id));
    }
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Close peek when sidebar gets pinned open
  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  const sortedIds = channelIds
    .filter((id) => id in channels)
    .sort((a, b) => {
      const nameA = (channels[a] as { name?: string })?.name ?? "";
      const nameB = (channels[b] as { name?: string })?.name ?? "";
      return nameA.localeCompare(nameB);
    });

  const bodyProps = { sortedIds, activeChannelId, setActiveChannelId, fetchChannels };

  return (
    <>
      {/* Normal pinned sidebar */}
      <Sidebar collapsible="offcanvas">
        <SidebarBody {...bodyProps} />
      </Sidebar>

      {/* Invisible edge hover zone — only when collapsed and not already peeking */}
      {state === "collapsed" && !peeking && (
        <div className="fixed inset-y-0 left-0 z-50 w-2" onMouseEnter={() => setPeeking(true)} />
      )}

      {/* Floating peek overlay */}
      <AnimatePresence>
        {peeking && state === "collapsed" && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onMouseLeave={() => setPeeking(false)}
            className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-surface-deep shadow-2xl shadow-black/50 ring-1 ring-border/50"
            style={{ margin: "8px", height: "calc(100% - 16px)", borderRadius: "12px" }}
          >
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl">
              <div className="border-b border-border">
                <OrgSwitcher large />
              </div>

              <div className="flex-1 overflow-y-auto px-2 py-2">
                <div className="mb-1 flex items-center justify-between px-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Channels
                  </span>
                  <CreateChannelDialog onCreated={fetchChannels} />
                </div>
                <div className="flex flex-col gap-0.5">
                  {sortedIds.map((id) => (
                    <PeekChannelItem
                      key={id}
                      id={id}
                      isActive={id === activeChannelId}
                      onClick={() => setActiveChannelId(id)}
                    />
                  ))}
                  {sortedIds.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No channels yet
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-border">
                <UserMenu />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Channel item for the peek overlay (no SidebarMenuButton dependency) */
function PeekChannelItem({
  id,
  isActive,
  onClick,
}: {
  id: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const name = useEntityStore((s) => (s.channels[id] as { name?: string } | undefined)?.name);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors ${
        isActive
          ? "bg-surface-elevated text-foreground"
          : "text-muted-foreground hover:bg-surface-elevated/50 hover:text-foreground"
      }`}
    >
      <Hash size={16} className="shrink-0 opacity-50" />
      <span className="truncate">{name}</span>
    </button>
  );
}
