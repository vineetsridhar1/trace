import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronRight,
  AppWindow,
  Code,
  Hash,
  Inbox,
  Figma,
  FileText,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  Ticket,
  UserRound,
} from "lucide-react";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import type { Channel, Chat, Repo, User } from "@trace/gql";
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
import { features } from "../../lib/features";
import { createQuickSession } from "../../lib/create-quick-session";
import { isLocalMode } from "../../lib/runtime-mode";
import { NewGeneratedProjectDialog } from "./NewGeneratedProjectDialog";
import { HomeKindIcon, homeKindLabel } from "../home/HomeKindIcon";
import { useHomeComposerStore } from "../../stores/home-composer";

interface PaletteItem {
  key: string;
  group: string;
  label: string;
  search: string;
  icon: ReactNode;
  meta?: string;
  shortcut?: CommandShortcut;
  onSelect: () => void;
}

const SETTINGS_TABS: { id: string; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "repositories", label: "Repositories" },
  { id: "agent-environments", label: "Agent Environments" },
  { id: "org-secrets", label: "Secrets" },
  { id: "integrations", label: "Integrations" },
  { id: "session-defaults", label: "Session Defaults" },
  { id: "api-keys", label: "API Keys" },
  { id: "bridge-access", label: "Devices & Access" },
];

export function GlobalCommandPalette() {
  const open = useCommandPaletteStore((s) => s.paletteOpen);
  const setOpen = useCommandPaletteStore((s) => s.setPaletteOpen);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] w-[min(92vw,620px)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-xl border border-[var(--th-edge-strong)] bg-[var(--th-surface)] p-0 shadow-[0_24px_64px_rgb(0_0_0/0.65)] sm:max-w-[620px]"
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Jump to a channel, conversation, or session, or run a quick action.
          </DialogDescription>
          {open && <CommandPaletteBody onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
      <NewGeneratedProjectDialog />
    </>
  );
}

function CommandPaletteBody({ onClose }: { onClose: () => void }) {
  // Seed from pendingQuery so ⌘F can open the palette pre-filled in search mode.
  // The body only mounts while open, so this initializer runs fresh each time.
  const [query, setQuery] = useState(() => useCommandPaletteStore.getState().pendingQuery);
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id ?? null);

  const setActivePage = useUIStore((s) => s.setActivePage);
  const openSearch = useUIStore((s) => s.openSearch);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const openGeneratedProjectDialog = useCommandPaletteStore((s) => s.openGeneratedProjectDialog);

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

  // Subscribe to the raw tables (stable references) and derive mapped arrays in
  // useMemo. Returning freshly-built objects directly from a selector — even via
  // useShallow — produces a new snapshot every render and loops useSyncExternalStore.
  const channelsTable = useEntityStore((s: { channels: Record<string, Channel> }) => s.channels);
  const chatsTable = useEntityStore((s: { chats: Record<string, Chat> }) => s.chats);
  const sessionGroupsTable = useEntityStore(
    (s: { sessionGroups: Record<string, SessionGroupEntity> }) => s.sessionGroups,
  );
  const reposTable = useEntityStore((s: { repos: Record<string, Repo> }) => s.repos);
  const usersTable = useEntityStore((s: { users: Record<string, User> }) => s.users);

  const channels = useMemo(
    () =>
      Object.values(channelsTable)
        .filter((c) => features.messaging || c.type !== "text")
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((c) => ({ id: c.id, name: c.name, type: c.type, repoId: c.repo?.id ?? null })),
    [channelsTable],
  );

  const chats = useMemo(
    () =>
      features.messaging
        ? Object.values(chatsTable).map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            otherName: c.members?.find((m) => m.user.id !== currentUserId)?.user.name ?? null,
          }))
        : [],
    [chatsTable, currentUserId],
  );

  const sessionGroups = useMemo(() => {
    const sortTs = (g: SessionGroupEntity) =>
      new Date(g._sortTimestamp ?? g.updatedAt ?? g.createdAt ?? 0).getTime();
    return Object.values(sessionGroupsTable)
      .sort((a, b) => sortTs(b) - sortTs(a))
      .map((g) => ({
        id: g.id,
        name: g.name ?? g.slug ?? "Untitled session",
        kind: g.kind,
        status: g.status,
        repoName: g.repo?.name ?? null,
        channelId: g.channel?.id ?? null,
      }));
  }, [sessionGroupsTable]);
  const repos = useMemo(
    () => Object.values(reposTable).sort((a, b) => a.name.localeCompare(b.name)),
    [reposTable],
  );
  const people = useMemo(
    () => Object.values(usersTable).sort((a, b) => a.name.localeCompare(b.name)),
    [usersTable],
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

  // Slack-style: wrapping the query in quotes means "search only" — jump-to items
  // are suppressed and the search page is the only option. The search term drops
  // the surrounding quotes.
  const trimmedQuery = query.trim();
  const isQuoted =
    trimmedQuery.length >= 2 && trimmedQuery.startsWith('"') && trimmedQuery.endsWith('"');
  const searchTerm = isQuoted ? trimmedQuery.slice(1, -1).trim() : trimmedQuery;

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
    list.push({
      key: "new-app-session",
      group: "Actions",
      label: "New app session",
      search: "new app session full stack create vibe code",
      icon: <AppWindow size={16} />,
      onSelect: () => {
        onClose();
        openGeneratedProjectDialog("app");
      },
    });
    list.push({
      key: "new-design-session",
      group: "Actions",
      label: "New design",
      search: "new design session screens flow visual create",
      icon: <Figma size={16} />,
      onSelect: () => {
        onClose();
        openGeneratedProjectDialog("design");
      },
    });
    list.push({
      key: "new-pdf-session",
      group: "Actions",
      label: "New PDF",
      search: "new pdf document print download create",
      icon: <FileText size={16} />,
      onSelect: () => {
        onClose();
        openGeneratedProjectDialog("pdf");
      },
    });
    list.push({
      key: "new-animation-session",
      group: "Actions",
      label: "New animation",
      search: "new animation session motion interaction framer create",
      icon: <Sparkles size={16} />,
      onSelect: () => {
        onClose();
        openGeneratedProjectDialog("animation");
      },
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
        group: paletteSessionGroup(group.kind),
        label: group.name,
        search: `session ${homeKindLabel(group.kind)} ${group.name} ${group.repoName ?? ""} ${group.id}`,
        icon: <HomeKindIcon kind={group.kind} className="size-4" />,
        meta:
          group.status === "needs_input"
            ? "needs input"
            : group.status === "in_review"
              ? "needs review"
              : (group.repoName ?? undefined),
        onSelect: () => navigateToSessionGroup(group.channelId, group.id),
      });
    }

    for (const repo of repos) {
      const channel = channels.find((candidate) => candidate.repoId === repo.id);
      list.push({
        key: `repo-${repo.id}`,
        group: "Repos",
        label: repo.name,
        search: `repo repository ${repo.name} ${repo.remoteUrl ?? ""}`,
        icon: <Hash size={16} />,
        meta: repo.defaultBranch,
        onSelect: () => {
          if (channel) {
            setActiveChannelId(channel.id);
          } else {
            setSettingsInitialTab("repositories");
            setActivePage("settings");
          }
        },
      });
    }

    for (const person of people) {
      list.push({
        key: `person-${person.id}`,
        group: "People",
        label: person.name,
        search: `person people member ${person.name} ${person.email}`,
        icon: <UserRound size={16} />,
        meta: person.email,
        onSelect: () => {
          setSettingsInitialTab("members");
          setActivePage("settings");
        },
      });
    }

    return list;
  }, [
    registeredGroups,
    openGeneratedProjectDialog,
    channels,
    chats,
    sessionGroups,
    repos,
    people,
    chatLabel,
    activeChannelIsCoding,
    activeChannelId,
    setActivePage,
    setActiveChannelId,
    setActiveChatId,
    setSettingsInitialTab,
  ]);

  const groups = useMemo(() => {
    // The search page is always the last option when there's a query, so Enter
    // falls through to it when nothing else matches.
    const searchGroup: { name: string; items: PaletteItem[] } | null = searchTerm
      ? {
          name: "More",
          items: [
            {
              key: "__start-session__",
              group: "More",
              label: `Start a new session: “${searchTerm}”`,
              search: "",
              icon: <Sparkles size={16} className="text-[var(--th-accent-light)]" />,
              meta: "⌘↵",
              onSelect: () => {
                setActiveChannelId(null);
                useHomeComposerStore.getState().requestFocus(searchTerm);
              },
            },
            {
              key: "__search-page__",
              group: "More",
              label: `Search for “${searchTerm}”`,
              search: "",
              icon: <Search size={16} />,
              onSelect: () => openSearch(searchTerm),
            },
          ],
        }
      : null;

    // Quoted query => search only, no jump-to items.
    if (isQuoted) return searchGroup ? [searchGroup] : [];

    const q = trimmedQuery.toLowerCase();
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
    // Message hits intentionally live only on the dedicated search page — running
    // a live search per keystroke here would be slow with lots of messages.
    ordered.sort((a, b) => groupPriority(a.name) - groupPriority(b.name));
    if (searchGroup) ordered.push(searchGroup);
    return ordered;
  }, [items, trimmedQuery, isQuoted, searchTerm, openSearch, setActiveChannelId]);

  return (
    <Command
      shouldFilter={false}
      loop
      className="rounded-xl bg-[var(--th-surface)]"
      onKeyDown={(event) => {
        if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter" || !searchTerm) return;
        event.preventDefault();
        run(() => {
          setActiveChannelId(null);
          useHomeComposerStore.getState().requestFocus(searchTerm);
        });
      }}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search sessions, repos, people, or actions…"
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
                  <HighlightedLabel label={item.label} query={searchTerm} />
                  {item.meta && (
                    <span
                      className={`ml-auto max-w-36 truncate text-[11px] ${
                        item.meta.includes("needs")
                          ? "text-[var(--th-warn)]"
                          : "text-[var(--th-muted)]"
                      }`}
                    >
                      {item.meta}
                    </span>
                  )}
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
      <div className="flex h-8 items-center gap-3 border-t border-[var(--th-edge)] bg-[var(--th-raised)] px-3 text-[10px] text-[var(--th-faint)]">
        <span>↑↓ navigate</span>
        <span>⏎ open</span>
        <span className="hidden sm:inline">⌘⏎ start new</span>
        <span className="ml-auto hidden sm:inline">sessions · repos · people</span>
      </div>
    </Command>
  );
}

function paletteSessionGroup(kind: SessionGroupEntity["kind"]): string {
  if (kind === "coding") return "Sessions";
  if (kind === "design") return "Designs";
  if (kind === "design_system") return "Design systems";
  if (kind === "app") return "Apps";
  if (kind === "pdf") return "PDFs";
  return "Animations";
}

function groupPriority(group: string): number {
  const order = [
    "Sessions",
    "Designs",
    "Apps",
    "PDFs",
    "Animations",
    "Design systems",
    "Repos",
    "People",
    "Actions",
    "Go to",
    "Channels",
    "Direct Messages",
    "Settings",
  ];
  const index = order.indexOf(group);
  return index === -1 ? order.length : index;
}

function HighlightedLabel({ label, query }: { label: string; query: string }) {
  const index = query ? label.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index === -1) return <span className="min-w-0 flex-1 truncate">{label}</span>;
  return (
    <span className="min-w-0 flex-1 truncate">
      {label.slice(0, index)}
      <mark className="rounded-sm bg-[color-mix(in_srgb,var(--th-accent)_28%,transparent)] text-inherit">
        {label.slice(index, index + query.length)}
      </mark>
      {label.slice(index + query.length)}
    </span>
  );
}
