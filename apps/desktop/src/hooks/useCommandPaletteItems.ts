import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { FiHash, FiUsers, FiFolder, FiGitBranch } from 'react-icons/fi';
import { createElement } from 'react';
import { gql } from '@apollo/client';
import type { Channel, Workspace, TicketStatus } from '../types';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import { useWorkspacesLazyQuery } from './__generated__/useMessages.generated';
import { useCommandPaletteStore } from '../stores/commandPaletteStore';
import { STATUS_CONFIG } from '../components/MessageItem';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: 'projects' | 'workspaces' | 'actions';
  icon?: ReactNode;
  keywords?: string[];
  action: () => void;
  shortcut?: string;
  statusLabel?: string;
  statusColor?: string;
  channelName?: string;
  avatarUrl?: string;
  avatarFallback?: string;
}

interface CommandGroup {
  category: CommandItem['category'];
  label: string;
  items: CommandItem[];
}

interface UseCommandPaletteItemsParams {
  serverChannels: Channel[];
  handleSwitchChannel: (channelId: string) => void;
  handleOpenThreadLink: (channelId: string, workspaceId: string) => void;
}

// Ensure the GQL query is referenced so codegen picks it up
const _GQL_WORKSPACES = gql`
  query Workspaces($channelId: ID!, $limit: Int, $offset: Int, $excludeStatus: String) {
    workspaces(channelId: $channelId, limit: $limit, offset: $offset, excludeStatus: $excludeStatus) {
      workspaces {
        ...WorkspaceFields
      }
      total
      mergedCount
      limit
      offset
    }
  }
  ${WORKSPACE_FIELDS}
`;

const CHANNEL_TYPE_ICONS: Record<string, typeof FiHash> = {
  channel: FiHash,
  team: FiUsers,
  project: FiFolder,
};

function getChannelItems(
  channels: Channel[],
  handleSwitchChannel: (channelId: string) => void,
): CommandItem[] {
  return channels.map((channel, index) => ({
    id: `channel-${channel.id}`,
    label: channel.name,
    description: channel.type,
    category: 'projects' as const,
    icon: createElement(CHANNEL_TYPE_ICONS[channel.type] ?? FiHash, { className: 'h-4 w-4' }),
    keywords: [channel.type, channel.name],
    action: () => handleSwitchChannel(channel.id),
    shortcut: index < 9 ? `mod+shift+${index + 1}` : undefined,
  }));
}

const HIDDEN_STATUSES = new Set<TicketStatus>(['completed', 'merged']);

function getWorkspaceItems(
  workspaces: Workspace[],
  channelName: string,
  ticketTitles: Record<string, string>,
  handleOpenThreadLink: (channelId: string, workspaceId: string) => void,
): CommandItem[] {
  return workspaces
    .filter((ws) => !HIDDEN_STATUSES.has((ws.status ?? 'pending') as TicketStatus))
    .map((workspace) => {
      const title = ticketTitles[workspace.id] || workspace.preview || workspace.cliSession?.cwd || workspace.id;
      const branch = workspace.branch?.replace(/^trace\//, '');
      const status = (workspace.status ?? 'pending') as TicketStatus;
      const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
      return {
        id: `workspace-${workspace.id}`,
        label: title,
        description: branch ?? undefined,
        category: 'workspaces' as const,
        icon: workspace.user?.avatarUrl ? undefined : createElement(FiGitBranch, { className: 'h-4 w-4' }),
        keywords: [workspace.branch, workspace.preview, workspace.status, config.label, channelName].filter(Boolean) as string[],
        action: () => handleOpenThreadLink(workspace.channelId, workspace.id),
        statusLabel: config.label,
        statusColor: config.color,
        channelName: channelName || undefined,
        avatarUrl: workspace.user?.avatarUrl ?? undefined,
        avatarFallback: workspace.user?.name?.[0] ?? undefined,
      };
    });
}

function matchesQuery(item: CommandItem, query: string): boolean {
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  if (item.description?.toLowerCase().includes(q)) return true;
  if (item.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true;
  return false;
}

export function useCommandPaletteItems({
  serverChannels,
  handleSwitchChannel,
  handleOpenThreadLink,
}: UseCommandPaletteItemsParams): { groups: CommandGroup[]; flatItems: CommandItem[] } {
  const query = useCommandPaletteStore((s) => s.query);
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const allWorkspaces = useCommandPaletteStore((s) => s.allWorkspaces);
  const ticketTitles = useCommandPaletteStore((s) => s.ticketTitles);

  const [executeWorkspaces] = useWorkspacesLazyQuery();
  // Fetch workspaces for all channels when the palette opens
  useEffect(() => {
    if (!isOpen) return;

    const store = useCommandPaletteStore.getState();
    store.clearAllWorkspaces();

    for (const channel of serverChannels) {
      void executeWorkspaces({ variables: { channelId: channel.id, limit: 200 } }).then(({ data }) => {
        if (!data) return;
        const fetched = [...data.workspaces.workspaces].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ) as Workspace[];
        useCommandPaletteStore.getState().setChannelWorkspaces(channel.id, fetched);

        // Extract ticket titles from workspace data
        const titles: Record<string, string> = {};
        for (const ws of fetched) {
          if (ws.ticketTitle) {
            titles[ws.id] = ws.ticketTitle;
          }
        }
        if (Object.keys(titles).length > 0) {
          useCommandPaletteStore.getState().mergeTicketTitles(titles);
        }
      });
    }
  }, [isOpen, serverChannels, executeWorkspaces]);

  // Build a channel ID → name lookup
  const channelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ch of serverChannels) map.set(ch.id, ch.name);
    return map;
  }, [serverChannels]);

  return useMemo(() => {
    // Flatten all workspaces across channels
    const allWs: Workspace[] = [];
    for (const channelWorkspaces of Object.values(allWorkspaces)) {
      allWs.push(...channelWorkspaces);
    }

    const workspaceItems: CommandItem[] = [];
    for (const ws of allWs) {
      const channelName = channelMap.get(ws.channelId) ?? '';
      workspaceItems.push(...getWorkspaceItems([ws], channelName, ticketTitles, handleOpenThreadLink));
    }

    const allItems: CommandItem[] = [
      ...getChannelItems(serverChannels, handleSwitchChannel),
      ...workspaceItems,
    ];

    const filtered = query ? allItems.filter((item) => matchesQuery(item, query)) : allItems;

    const categoryOrder: Array<{ category: CommandItem['category']; label: string }> = [
      { category: 'projects', label: 'Projects' },
      { category: 'workspaces', label: 'Workspaces' },
      { category: 'actions', label: 'Actions' },
    ];

    const groups: CommandGroup[] = [];
    const flatItems: CommandItem[] = [];

    for (const { category, label } of categoryOrder) {
      const items = filtered.filter((item) => item.category === category);
      if (items.length > 0) {
        groups.push({ category, label, items });
        flatItems.push(...items);
      }
    }

    return { groups, flatItems };
  }, [query, serverChannels, allWorkspaces, ticketTitles, channelMap, handleSwitchChannel, handleOpenThreadLink]);
}
