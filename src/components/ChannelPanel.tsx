import { Reorder } from 'framer-motion';
import { FiPlus, FiUsers, FiMessageCircle, FiTrash2, FiHash, FiLayers, FiFolder, FiChevronRight } from 'react-icons/fi';
import type { AiChat, Channel, DragTarget, LocalChannelConfig, Server } from '../types';
import { Tooltip } from './Tooltip';
import { useSidebarPrefs, type SidebarSectionId } from '../hooks/useSidebarPrefs';
import { ServerSwitcher } from './ServerSwitcher';

const SECTION_CONFIG: Record<SidebarSectionId, { icon: typeof FiHash; label: string }> = {
  channels: { icon: FiHash, label: 'Channels' },
  teams: { icon: FiLayers, label: 'Teams' },
  projects: { icon: FiFolder, label: 'Projects' },
  dms: { icon: FiUsers, label: 'Direct Messages' },
  'ai-chats': { icon: FiMessageCircle, label: 'AI Chats' },
};

interface ChannelPanelProps {
  channels: Channel[];
  activeChannelId: string | null;
  channelWidth: number;
  dragging: DragTarget;
  servers: Server[];
  activeServerId: string | null;
  activeServer: Server | null;
  onSwitchServer: (serverId: string) => void;
  onCreateServer: () => void;
  aiChats: AiChat[];
  activeAiChatId: string | null;
  unreadCounts?: Record<string, number>;
  localConfigs?: Record<string, LocalChannelConfig>;
  onSwitchChannel: (id: string) => void;
  onCreateTeam: () => void;
  onCreateProject: () => void;
  onCreateChannel: () => void;
  onSwitchAiChat: (id: string) => void;
  onCreateAiChat: () => void;
  onDeleteAiChat: (id: string) => void;
  onStartDrag: () => void;
}

export function ChannelPanel({
  channels,
  activeChannelId,
  channelWidth,
  dragging,
  servers,
  activeServerId,
  activeServer,
  onSwitchServer,
  onCreateServer,
  aiChats,
  activeAiChatId,
  onSwitchChannel,
  onCreateTeam,
  onCreateProject,
  onCreateChannel,
  onSwitchAiChat,
  onCreateAiChat,
  onDeleteAiChat,
  onStartDrag,
  unreadCounts = {},
  localConfigs = {},
}: ChannelPanelProps) {
  const chatChannels = channels.filter((c) => c.type === 'channel');
  const teamChannels = channels.filter((c) => c.type === 'team');
  const projectChannels = channels.filter((c) => c.type === 'project');
  const { sectionOrder, collapsedSections, reorder, toggleCollapsed } = useSidebarPrefs();

  // Map channel id → global shortcut index (1-9) for Mod+Shift+N
  const channelShortcutMap = new Map<string, number>();
  channels.forEach((ch, i) => { if (i < 9) channelShortcutMap.set(ch.id, i + 1); });

  const renderChannelItems = (items: Channel[]) =>
    items.map((channel) => {
      const isActive = channel.id === activeChannelId && !activeAiChatId;
      const count = unreadCounts[channel.id] ?? 0;
      const needsJoin = !!(channel.workspacesEnabled && channel.githubUrl && !localConfigs[channel.id]?.localRepoPath);
      const shortcutNum = channelShortcutMap.get(channel.id);
      return (
        <div key={channel.id} className="my-0.5 flex items-center">
          <button
            type="button"
            onClick={() => onSwitchChannel(channel.id)}
            className={`channel-item flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
              isActive ? 'active font-semibold' : 'text-primary'
            }`}
          >
            <span className="text-xs text-muted">#</span>
            <span className={`truncate ${needsJoin && !isActive ? 'text-muted' : ''}`}>{channel.name}</span>
            {needsJoin ? (
              <span className="ml-auto shrink-0 rounded border border-accent/30 px-1.5 py-0.5 text-[10px] font-medium leading-none text-accent">
                Join
              </span>
            ) : !isActive && count > 0 ? (
              <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-on-accent">
                {count > 99 ? '99+' : count}
              </span>
            ) : shortcutNum ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-px opacity-50">
                <kbd className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded border border-edge bg-surface-deep px-0.5 text-[9px] font-medium leading-none text-muted">⌘</kbd>
                <kbd className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded border border-edge bg-surface-deep px-0.5 text-[9px] font-medium leading-none text-muted">⇧</kbd>
                <kbd className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded border border-edge bg-surface-deep px-0.5 text-[9px] font-medium leading-none text-muted">{shortcutNum}</kbd>
              </span>
            ) : null}
          </button>
        </div>
      );
    });

  const renderActionButton = (id: SidebarSectionId) => {
    switch (id) {
      case 'teams':
        return (
          <Tooltip text="Create team" position="bottom">
            <button
              type="button"
              onClick={onCreateTeam}
              className="rounded p-0.5 text-muted hover:bg-surface-elevated hover:text-accent"
            >
              <FiPlus className="h-3 w-3" aria-hidden="true" />
            </button>
          </Tooltip>
        );
      case 'projects':
        return (
          <Tooltip text="Create project" position="bottom">
            <button
              type="button"
              onClick={onCreateProject}
              className="rounded p-0.5 text-muted hover:bg-surface-elevated hover:text-accent"
            >
              <FiPlus className="h-3 w-3" aria-hidden="true" />
            </button>
          </Tooltip>
        );
      case 'channels':
        return (
          <Tooltip text="Create channel" position="bottom">
            <button
              type="button"
              onClick={onCreateChannel}
              className="rounded p-0.5 text-muted hover:bg-surface-elevated hover:text-accent"
            >
              <FiPlus className="h-3 w-3" aria-hidden="true" />
            </button>
          </Tooltip>
        );
      case 'dms':
        return (
          <Tooltip text="New DM" position="bottom">
            <button
              type="button"
              className="rounded p-0.5 text-muted hover:bg-surface-elevated hover:text-accent"
            >
              <FiPlus className="h-3 w-3" aria-hidden="true" />
            </button>
          </Tooltip>
        );
      case 'ai-chats':
        return (
          <Tooltip text="New AI chat" position="bottom">
            <button
              type="button"
              onClick={onCreateAiChat}
              className="rounded p-0.5 text-muted hover:bg-surface-elevated hover:text-accent-light"
            >
              <FiPlus className="h-3 w-3" aria-hidden="true" />
            </button>
          </Tooltip>
        );
    }
  };

  const renderSectionContent = (id: SidebarSectionId) => {
    switch (id) {
      case 'channels':
        return chatChannels.length === 0 ? (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-muted">No channels yet</span>
          </div>
        ) : (
          renderChannelItems(chatChannels)
        );
      case 'teams':
        return teamChannels.length === 0 ? (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-muted">No teams yet</span>
          </div>
        ) : (
          renderChannelItems(teamChannels)
        );
      case 'projects':
        return projectChannels.length === 0 ? (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-muted">No projects yet</span>
          </div>
        ) : (
          renderChannelItems(projectChannels)
        );
      case 'dms':
        return (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-muted">Coming soon...</span>
          </div>
        );
      case 'ai-chats':
        return aiChats.map((chat) => {
          const isActive = chat.id === activeAiChatId;
          return (
            <div key={chat.id} className="group my-0.5 flex items-center">
              <button
                type="button"
                onClick={() => onSwitchAiChat(chat.id)}
                className={`channel-item flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive ? 'bg-surface-elevated font-semibold text-accent-light' : 'text-primary'
                }`}
              >
                <FiMessageCircle className="h-3 w-3 shrink-0 text-muted" />
                <span className="truncate">{chat.title}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteAiChat(chat.id);
                }}
                className="mr-1 rounded p-0.5 text-muted opacity-0 hover:bg-surface-elevated hover:text-red-400 group-hover:opacity-100"
              >
                <FiTrash2 className="h-3 w-3" />
              </button>
            </div>
          );
        });
    }
  };

  return (
    <>
      <div
        id="channel-panel"
        className={`flex min-w-0 flex-col border-r border-edge bg-surface-deep ${dragging ? '' : 'panel-animate'}`}
        style={{ width: `${channelWidth}px`, overflow: channelWidth === 0 ? 'hidden' : undefined }}
      >
        <ServerSwitcher
          servers={servers}
          activeServerId={activeServerId}
          activeServer={activeServer}
          onSwitchServer={onSwitchServer}
          onCreateServer={onCreateServer}
        />

        <Reorder.Group
          id="channel-items"
          axis="y"
          values={sectionOrder}
          onReorder={reorder}
          className="flex-1 overflow-y-auto px-2 py-1"
          as="div"
        >
          {sectionOrder.map((id) => {
            const config = SECTION_CONFIG[id];
            const Icon = config.icon;
            const isCollapsed = collapsedSections.has(id);

            return (
              <Reorder.Item
                key={id}
                value={id}
                as="div"
                className="relative border-b border-edge bg-surface-deep py-2 last:border-b-0"
                whileDrag={{ zIndex: 50 }}
              >
                <div className="mb-1 flex w-full items-center justify-between px-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-muted" />
                    <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
                      {config.label}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1">
                    {renderActionButton(id)}
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      aria-label={`Toggle ${config.label}`}
                      onClick={() => toggleCollapsed(id)}
                      className="cursor-pointer rounded p-0.5 text-muted hover:bg-surface-elevated"
                    >
                      <FiChevronRight
                        className={`h-3 w-3 transition-transform duration-150 ${!isCollapsed ? 'rotate-90' : ''}`}
                      />
                    </button>
                  </div>
                </div>
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
                >
                  <div className="overflow-hidden">
                    {renderSectionContent(id)}
                  </div>
                </div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      </div>

      {channelWidth > 0 && (
        <div
          className={`resize-handle ${dragging === 'left' ? 'active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onStartDrag();
          }}
        />
      )}
    </>
  );
}
