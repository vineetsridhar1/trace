import { useMemo, useState } from "react";
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { useUIStore } from "../../stores/ui";
import { navigateToSessionGroup } from "../../stores/ui";
import { useCommandPaletteStore } from "../../stores/command-palette";
import {
  formatShortcut,
  useCommandRegistryStore,
  type RegisteredCommand,
} from "../../stores/command-registry";
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

  const openSettingsTab = (tabId: string) => {
    setSettingsInitialTab(tabId);
    setActivePage("settings");
  };

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

  return (
    <Command loop className="rounded-lg bg-[#111111]">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Jump to a channel, conversation, or run a command…"
        autoFocus
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Go to">
          <CommandItem
            value="inbox notifications"
            onSelect={() => run(() => setActivePage("inbox"))}
          >
            <Inbox size={16} />
            <span>Inbox</span>
          </CommandItem>
          {features.tickets && (
            <CommandItem
              value="tickets issues"
              onSelect={() => run(() => setActivePage("tickets"))}
            >
              <Ticket size={16} />
              <span>Tickets</span>
            </CommandItem>
          )}
          <CommandItem
            value="settings preferences"
            onSelect={() => run(() => setActivePage("settings"))}
          >
            <Settings size={16} />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        {registeredGroups.map(([group, commands]) => (
          <CommandGroup key={group} heading={group}>
            {commands.map((command) => (
              <CommandItem
                key={command.id}
                value={`${group} ${command.title} ${command.keywords ?? ""}`}
                onSelect={() => run(command.run)}
              >
                <ChevronRight size={16} className="text-muted-foreground" />
                <span className="truncate">{command.title}</span>
                {command.shortcut && (
                  <span className="ml-auto flex items-center gap-1">
                    {formatShortcut(command.shortcut).map((key, i) => (
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
        ))}

        <CommandGroup heading="Settings">
          {SETTINGS_TABS.filter((tab) => !(tab.id === "api-keys" && isLocalMode)).map((tab) => (
            <CommandItem
              key={tab.id}
              value={`settings ${tab.label}`}
              onSelect={() => run(() => openSettingsTab(tab.id))}
            >
              <Settings size={16} />
              <span className="truncate">Settings: {tab.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {activeChannelIsCoding && activeChannelId && (
          <CommandGroup heading="Actions">
            <CommandItem
              value="new session create public"
              onSelect={() =>
                run(() => createQuickSession(activeChannelId, { visibility: "public" }))
              }
            >
              <Plus size={16} />
              <span>New session</span>
            </CommandItem>
            <CommandItem
              value="new private session create"
              onSelect={() =>
                run(() => createQuickSession(activeChannelId, { visibility: "private" }))
              }
            >
              <Plus size={16} />
              <span>New private session</span>
            </CommandItem>
          </CommandGroup>
        )}

        {channels.length > 0 && (
          <CommandGroup heading="Channels">
            {channels.map((channel) => (
              <CommandItem
                key={channel.id}
                value={`channel ${channel.name} ${channel.id}`}
                onSelect={() => run(() => setActiveChannelId(channel.id))}
              >
                {channel.type === "coding" ? <Code size={16} /> : <Hash size={16} />}
                <span className="truncate">{channel.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {chats.length > 0 && (
          <CommandGroup heading="Direct Messages">
            {chats.map((chat) => {
              const label = chatLabel.get(chat.id) ?? "Direct Message";
              return (
                <CommandItem
                  key={chat.id}
                  value={`dm ${label} ${chat.id}`}
                  onSelect={() => run(() => setActiveChatId(chat.id))}
                >
                  <MessageCircle size={16} />
                  <span className="truncate">{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {sessionGroups.length > 0 && (
          <CommandGroup heading="Sessions">
            {sessionGroups.map((group) => (
              <CommandItem
                key={group.id}
                value={`session ${group.name} ${group.id}`}
                onSelect={() => run(() => navigateToSessionGroup(null, group.id))}
              >
                <GitBranch size={16} />
                <span className="truncate">{group.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
