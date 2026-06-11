import { useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronRight,
  Code,
  GitBranch,
  Hash,
  Inbox,
  MessageCircle,
  Plus,
  Settings,
  Ticket,
} from "lucide-react";
import { useAuthStore, useEntityStore } from "@trace/client-core";
import type { Channel, Chat } from "@trace/gql";
import type { SessionGroupEntity } from "@trace/client-core";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { useUIStore } from "../../stores/ui";
import { navigateToSessionGroup } from "../../stores/ui";
import { useCommandPaletteStore } from "../../stores/command-palette";
import {
  formatShortcut,
  useCommandRegistryStore,
  type CommandShortcut,
  type RegisteredCommand,
} from "../../stores/command-registry";

interface PaletteItem {
  key: string;
  group: string;
  label: string;
  search: string;
  icon: ReactNode;
  shortcut?: CommandShortcut;
  onSelect: () => void;
}
import { features } from "../../lib/features";
import { createQuickSession } from "../../lib/create-quick-session";
import { isLocalMode } from "../../lib/runtime-mode";

const SETTINGS_TABS: { id: string; label: string }[] = [
  { id: "repositories", label: "Repositories" },
  { id: "connections", label: "Connections" },
  { id: "members", label: "Members" },
  { id: "session-defaults", label: "Session Defaults" },
  { id: "notifications", label: "Notifications" },
  { id: "api-keys", label: "API Keys" },
  { id: "bridge-access", label: "Bridge Access" },
  { id: "agent-environments", label: "Agent Environments" },
  { id: "org-secrets", label: "Org Secrets" },
  { id: "integrations", label: "Integrations" },
  { id: "channels", label: "Channels" },
];

export function GlobalCommandPalette() {
  const open = useCommandPaletteStore((s) => s.paletteOpen);
  const setOpen = useCommandPaletteStore((s) => s.setPaletteOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-4rem)] w-[min(92vw,640px)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#111111] p-0 shadow-2xl sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to a channel, conversation, or session, or run a quick action.
        </DialogDescription>
        {open && <CommandPaletteBody onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CommandPaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const currentUserId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);

  const setActivePage = useUIStore((s) => s.setActivePage);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);
  const activeChannelId = useUIStore((s) => s.activeChannelId);

  const commandsByToken = useCommandRegistryStore((s) => s.commandsByToken);
  const registeredGroups = useMemo(() => {
    const byGroup = new Map<string, RegisteredCommand[]>();
    for (const commands of Object.values(commandsByToken)) {
      for (const command of commands) {
        const existing = byGroup.get(command.group);
        if (existing) existing.push(command);
        else byGroup.set(command.group, [command]);
      }
    }
    return [...byGroup.entries()];
  }, [commandsByToken]);

  const channels = useEntityStore(
    useShallow((s: { channels: Record<string, Channel> }) =>
      Object.values(s.channels)
        .filter((c) => features.messaging || c.type !== "text")
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((c) => ({ id: c.id, name: c.name, type: c.type })),
    ),
  );

  const chats = useEntityStore(
    useShallow((s: { chats: Record<string, Chat> }) =>
      features.messaging
        ? Object.values(s.chats).map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            otherName:
              c.members?.find((m) => m.user.id !== currentUserId)?.user.name ?? null,
          }))
        : [],
    ),
  );

  const sessionGroups = useEntityStore(
    useShallow((s: { sessionGroups: Record<string, SessionGroupEntity> }) =>
      Object.values(s.sessionGroups).map((g) => ({
        id: g.id,
        name: g.name ?? g.slug ?? "Untitled session",
      })),
    ),
  );

  const activeChannelIsCoding = useEntityStore((s: { channels: Record<string, Channel> }) =>
    activeChannelId ? s.channels[activeChannelId]?.type === "coding" : false,
  );

  const run = (action: () => void) => {
    onClose();
    action();
  };

  const chatLabel = useMemo(
    () =>
      new Map(
        chats.map((c) => [
          c.id,
          c.name ?? (c.type === "dm" ? (c.otherName ?? "Direct Message") : "Group Chat"),
        ]),
      ),
    [chats],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];

    list.push({
      key: "goto-inbox",
      group: "Go to",
      label: "Inbox",
      search: "inbox notifications go to",
      icon: <Inbox size={16} />,
      onSelect: () => setActivePage("inbox"),
    });
    if (features.tickets) {
      list.push({
        key: "goto-tickets",
        group: "Go to",
        label: "Tickets",
        search: "tickets issues go to",
        icon: <Ticket size={16} />,
        onSelect: () => setActivePage("tickets"),
      });
    }
    list.push({
      key: "goto-settings",
      group: "Go to",
      label: "Settings",
      search: "settings preferences go to",
      icon: <Settings size={16} />,
      onSelect: () => setActivePage("settings"),
    });

    for (const [group, commands] of registeredGroups) {
      for (const command of commands) {
        list.push({
          key: command.id,
          group,
          label: command.title,
          search: `${group} ${command.title} ${command.keywords ?? ""}`,
          icon: <ChevronRight size={16} className="text-muted-foreground" />,
          shortcut: command.shortcut,
          onSelect: command.run,
        });
      }
    }

    for (const tab of SETTINGS_TABS) {
      if (tab.id === "api-keys" && isLocalMode) continue;
      list.push({
        key: `settings-${tab.id}`,
        group: "Settings",
        label: `Settings: ${tab.label}`,
        search: `settings ${tab.label}`,
        icon: <Settings size={16} />,
        onSelect: () => {
          setSettingsInitialTab(tab.id);
          setActivePage("settings");
        },
      });
    }

    if (activeChannelIsCoding && activeChannelId) {
      list.push(
        {
          key: "new-session",
          group: "Actions",
          label: "New session",
          search: "new session create public",
          icon: <Plus size={16} />,
          onSelect: () => void createQuickSession(activeChannelId, { visibility: "public" }),
        },
        {
          key: "new-private-session",
          group: "Actions",
          label: "New private session",
          search: "new private session create",
          icon: <Plus size={16} />,
          onSelect: () => void createQuickSession(activeChannelId, { visibility: "private" }),
        },
      );
    }

    for (const channel of channels) {
      list.push({
        key: `channel-${channel.id}`,
        group: "Channels",
        label: channel.name,
        search: `channel ${channel.name} ${channel.id}`,
        icon: channel.type === "coding" ? <Code size={16} /> : <Hash size={16} />,
        onSelect: () => setActiveChannelId(channel.id),
      });
    }

    for (const chat of chats) {
      const label = chatLabel.get(chat.id) ?? "Direct Message";
      list.push({
        key: `chat-${chat.id}`,
        group: "Direct Messages",
        label,
        search: `dm ${label} ${chat.id}`,
        icon: <MessageCircle size={16} />,
        onSelect: () => setActiveChatId(chat.id),
      });
    }

    for (const group of sessionGroups) {
      list.push({
        key: `session-${group.id}`,
        group: "Sessions",
        label: group.name,
        search: `session ${group.name} ${group.id}`,
        icon: <GitBranch size={16} />,
        onSelect: () => navigateToSessionGroup(null, group.id),
      });
    }

    return list;
  }, [
    registeredGroups,
    channels,
    chats,
    sessionGroups,
    chatLabel,
    activeChannelIsCoding,
    activeChannelId,
    setActivePage,
    setActiveChannelId,
    setActiveChatId,
    setSettingsInitialTab,
  ]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? items.filter((item) => item.search.toLowerCase().includes(q)) : items;
    const ordered: { name: string; items: PaletteItem[] }[] = [];
    const index = new Map<string, PaletteItem[]>();
    for (const item of visible) {
      let bucket = index.get(item.group);
      if (!bucket) {
        bucket = [];
        index.set(item.group, bucket);
        ordered.push({ name: item.group, items: bucket });
      }
      bucket.push(item);
    }
    return ordered;
  }, [items, query]);

  return (
    <Command shouldFilter={false} loop className="rounded-lg bg-[#111111]">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Jump to a channel, conversation, or run a command…"
        autoFocus
      />
      <CommandList>
        {groups.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No results found.</div>
        ) : (
          groups.map((group) => (
            <CommandGroup key={group.name} heading={group.name}>
              {group.items.map((item) => (
                <CommandItem key={item.key} value={item.key} onSelect={() => run(item.onSelect)}>
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                  {item.shortcut && (
                    <span className="ml-auto flex items-center gap-1">
                      {formatShortcut(item.shortcut).map((key, i) => (
                        <kbd
                          key={i}
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))
        )}
      </CommandList>
    </Command>
  );
}
