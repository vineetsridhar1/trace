import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Reorder } from 'framer-motion';
import { FiPlus, FiBriefcase, FiMessageCircle, FiTrash2, FiHash, FiLayers, FiFolder, FiSettings, FiMoreVertical, FiSearch } from 'react-icons/fi';
import type { AiChat, Channel, DragTarget, LocalChannelConfig, Server, TicketStatus } from '../types';
import { TAB_LABELS, VIEW_TAB_TYPES, isViewTabAvailable } from '../stores/tabStore';
import type { GlobalTabType } from '../stores/tabStore';
import { Tooltip } from './Tooltip';
import { useSidebarPrefs, type SidebarSectionId } from '../hooks/useSidebarPrefs';
import { ServerSwitcher } from './ServerSwitcher';
import { SyncStatus } from './SyncStatus';
import { useMyWorkspaces } from '../hooks/useMyWorkspaces';
import { STATUS_CONFIG } from './MessageItem';
import { useAppUIStore } from '../stores/appUIStore';

const SECTION_CONFIG: Record<SidebarSectionId, { icon: typeof FiHash; label: string }> = {
  channels: { icon: FiHash, label: 'Channels' },
  teams: { icon: FiLayers, label: 'Teams' },
  projects: { icon: FiFolder, label: 'Projects' },
  'my-workspaces': { icon: FiBriefcase, label: 'My Workspaces' },
  'ai-chats': { icon: FiMessageCircle, label: 'AI Chats' },
};

function projectNeedsJoin(channel: Channel, localConfigs: Record<string, LocalChannelConfig>) {
  return !!(channel.workspacesEnabled && channel.githubUrl && !localConfigs[channel.id]?.localRepoPath);
}

function isProjectAvailable(channel: Channel, localConfigs: Record<string, LocalChannelConfig>) {
  return !projectNeedsJoin(channel, localConfigs);
}

interface ProjectDirectoryMenuProps {
  projects: Channel[];
  activeChannelId: string | null;
  localConfigs: Record<string, LocalChannelConfig>;
  anchorRect: DOMRect;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onJoinProject: (channelId: string) => void;
  onSwitchChannel: (channelId: string) => void;
}

function ProjectDirectoryMenu({
  projects,
  activeChannelId,
  localConfigs,
  anchorRect,
  triggerRef,
  onClose,
  onJoinProject,
  onSwitchChannel,
}: ProjectDirectoryMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, triggerRef]);

  const filterLower = filter.trim().toLowerCase();
  const filteredProjects = filterLower
    ? projects.filter((project) => project.name.toLowerCase().includes(filterLower))
    : projects;

  const width = 280;
  const viewportPadding = 8;
  const roomBelow = window.innerHeight - anchorRect.bottom;
  const roomAbove = anchorRect.top;
  const openAbove = roomBelow < 280 && roomAbove > roomBelow;
  const left = Math.max(
    viewportPadding,
    Math.min(anchorRect.right - width, window.innerWidth - width - viewportPadding),
  );

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] overflow-hidden rounded-md border border-edge bg-surface-elevated shadow-lg"
      style={
        openAbove
          ? {
              left,
              bottom: window.innerHeight - anchorRect.top + 6,
              width,
              maxHeight: Math.max(180, roomAbove - 16),
            }
          : {
              left,
              top: anchorRect.bottom + 6,
              width,
              maxHeight: Math.max(180, roomBelow - 12),
            }
      }
    >
      <div className="border-b border-edge px-2 py-2">
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Browse projects..."
            className="w-full rounded border border-edge bg-surface-deep py-1.5 pl-7 pr-2 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-y-auto py-1">
        {filteredProjects.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted">No matching projects</div>
        ) : (
          filteredProjects.map((project) => {
            const joined = !!localConfigs[project.id]?.localRepoPath;
            const available = isProjectAvailable(project, localConfigs);
            const needsJoin = projectNeedsJoin(project, localConfigs);
            const isActive = project.id === activeChannelId;

            return (
              <div key={project.id} className="px-1">
                <button
                  type="button"
                  onClick={() => {
                    if (available) {
                      onSwitchChannel(project.id);
                    } else {
                      onJoinProject(project.id);
                    }
                    onClose();
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    isActive && available
                      ? 'bg-surface-hover text-accent-light'
                      : 'text-primary hover:bg-surface-hover'
                  }`}
                >
                  <FiFolder className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className={`min-w-0 flex-1 truncate ${needsJoin ? 'text-muted' : ''}`}>{project.name}</span>
                  {available ? (
                    <span className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {isActive ? 'Open' : joined ? 'Joined' : 'Open'}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded border border-accent/30 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      Join
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}


function MyWorkspacesContent({ activeServerId, onOpenWorkspaceLink }: { activeServerId: string | null; onOpenWorkspaceLink: (channelId: string, workspaceId: string) => void }) {
  const { workspaces, loading } = useMyWorkspaces(activeServerId);

  if (loading && workspaces.length === 0) {
    return (
      <div className="px-3 py-1.5">
        <span className="text-xs italic text-muted">Loading...</span>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="px-3 py-1.5">
        <span className="text-xs italic text-muted">No active workspaces</span>
      </div>
    );
  }

  return (
    <>
      {workspaces.map((ws) => {
        const statusKey = (ws.status ?? 'pending') as TicketStatus;
        const statusCfg = STATUS_CONFIG[statusKey];
        const dotColor = statusCfg?.color ?? 'text-muted';
        return (
          <div key={ws.id} className="my-0.5 flex items-center">
            <button
              type="button"
              onClick={() => onOpenWorkspaceLink(ws.channelId, ws.id)}
              className="channel-item flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors text-primary"
            >
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor.replace('text-', 'bg-')}`} />
              <span className="truncate">{ws.ticketTitle || ws.preview || 'New Workspace'}</span>
              {ws.channelName && (
                <span className="ml-auto shrink-0 text-[10px] text-muted">#{ws.channelName}</span>
              )}
            </button>
          </div>
        );
      })}
    </>
  );
}

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
  onJoinChannel: (id: string) => void;
  onCreateTeam: () => void;
  onCreateProject: () => void;
  onCreateChannel: () => void;
  onSwitchAiChat: (id: string) => void;
  onCreateAiChat: () => void;
  onDeleteAiChat: (id: string) => void;
  onStartDrag: () => void;
  onOpenWorkspaceLink: (channelId: string, workspaceId: string) => void;
  onOpenViewTab: (viewType: GlobalTabType) => void;
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
  onOpenWorkspaceLink,
  onOpenViewTab,
  unreadCounts = {},
  localConfigs = {},
  onJoinChannel,
}: ChannelPanelProps) {
  const chatChannels = channels.filter((c) => c.type === 'channel');
  const teamChannels = channels.filter((c) => c.type === 'team');
  const projectChannels = channels.filter((c) => c.type === 'project');
  const joinedProjectChannels = useMemo(
    () => projectChannels.filter((channel) => isProjectAvailable(channel, localConfigs)),
    [projectChannels, localConfigs],
  );
  const { sectionOrder, collapsedSections, reorder, toggleCollapsed } = useSidebarPrefs();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<DOMRect | null>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Compute available views for the active channel (used by the view select)
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const availableViews = activeChannel
    ? VIEW_TAB_TYPES.filter((t) =>
        isViewTabAvailable(
          t,
          activeChannel.type,
          activeChannel.workspacesEnabled ?? false,
          !!(activeChannel.workspacesEnabled && activeChannel.githubUrl),
          !!activeChannel.localRepoPath,
        ),
      )
    : [];

  // Map channel id → global shortcut index (1-9) for Mod+Shift+N
  const channelShortcutMap = new Map<string, number>();
  channels.forEach((ch, i) => { if (i < 9) channelShortcutMap.set(ch.id, i + 1); });

  const renderChannelItems = (items: Channel[]) =>
    items.map((channel) => {
      const isActive = channel.id === activeChannelId;
      const count = unreadCounts[channel.id] ?? 0;
      const needsJoin = !!(channel.workspacesEnabled && channel.githubUrl && !localConfigs[channel.id]?.localRepoPath);
      const shortcutNum = channelShortcutMap.get(channel.id);
      return (
        <div key={channel.id} className="group my-0.5 flex items-center">
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
              <span className="ml-auto inline-flex shrink-0 items-center gap-px opacity-50 group-hover:hidden">
                <kbd className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded border border-edge bg-surface-deep px-0.5 text-[9px] font-medium leading-none text-muted">⌘</kbd>
                <kbd className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded border border-edge bg-surface-deep px-0.5 text-[9px] font-medium leading-none text-muted">⇧</kbd>
                <kbd className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded border border-edge bg-surface-deep px-0.5 text-[9px] font-medium leading-none text-muted">{shortcutNum}</kbd>
              </span>
            ) : null}
          </button>
          {!needsJoin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                useAppUIStore.getState().setSettingsChannelId(channel.id);
              }}
              className="mr-1 rounded p-0.5 text-muted opacity-0 hover:bg-surface-elevated hover:text-primary group-hover:opacity-100"
            >
              <FiSettings className="h-3 w-3" />
            </button>
          )}
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
          <>
            <Tooltip text="Create project" position="bottom">
              <button
                type="button"
                onClick={onCreateProject}
                className="rounded p-0.5 text-muted hover:bg-surface-elevated hover:text-accent"
              >
                <FiPlus className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip text="Browse projects" position="bottom">
              <button
                ref={projectMenuButtonRef}
                type="button"
                onClick={(event) => {
                  setProjectMenuAnchor(event.currentTarget.getBoundingClientRect());
                  setProjectMenuOpen((prev) => !prev);
                }}
                className={`rounded p-0.5 transition-colors ${
                  projectMenuOpen
                    ? 'bg-surface-elevated text-accent'
                    : 'text-muted hover:bg-surface-elevated hover:text-accent'
                }`}
              >
                <FiMoreVertical className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>
          </>
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
      case 'my-workspaces':
        return null;
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
        return joinedProjectChannels.length === 0 ? (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-muted">No projects in sidebar</span>
          </div>
        ) : (
          renderChannelItems(joinedProjectChannels)
        );
      case 'my-workspaces':
        return <MyWorkspacesContent activeServerId={activeServerId} onOpenWorkspaceLink={onOpenWorkspaceLink} />;
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

  const mobileDrawerOpen = useAppUIStore((s) => s.mobileDrawerOpen);

  return (
    <>
      <div
        id="channel-panel"
        className={`flex min-w-0 flex-col border-r border-edge bg-surface-deep ${dragging ? '' : 'panel-animate'} ${mobileDrawerOpen ? 'mobile-drawer-open' : ''}`}
        style={{ width: `${channelWidth}px`, overflow: channelWidth === 0 ? 'hidden' : undefined }}
      >
        <ServerSwitcher
          servers={servers}
          activeServerId={activeServerId}
          activeServer={activeServer}
          onSwitchServer={onSwitchServer}
          onCreateServer={onCreateServer}
        />

        <div className="px-3 py-1.5 flex flex-col gap-1.5">
          {availableViews.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  onOpenViewTab(val as GlobalTabType);
                  e.target.value = '';
                }
              }}
              className="w-full rounded-md border border-edge bg-surface-elevated px-2 py-1.5 text-xs text-primary focus:border-accent focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Open view…</option>
              {availableViews.map((t) => (
                <option key={t} value={t}>{TAB_LABELS[t]}</option>
              ))}
            </select>
          )}
        </div>

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
                <div className="mb-1 flex w-full items-center justify-between rounded-md px-2 hover:bg-surface-elevated">
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-label={`Toggle ${config.label}`}
                    onClick={() => toggleCollapsed(id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left"
                  >
                    <Icon className="h-3 w-3 shrink-0 text-muted" />
                    <h2 className="truncate text-xs font-semibold tracking-wide text-muted uppercase">
                      {config.label}
                    </h2>
                  </button>
                  <div className="flex items-center gap-1">
                    {renderActionButton(id)}
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
        <SyncStatus settingsButton={
          <Tooltip text="Instance settings" position="top">
            <button
              type="button"
              onClick={() => useAppUIStore.getState().setShowInstanceSettings(true)}
              className="rounded p-1 text-muted hover:bg-surface-elevated hover:text-primary transition-colors"
            >
              <FiSettings className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        } />
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

      {projectMenuOpen && projectMenuAnchor && (
        <ProjectDirectoryMenu
          projects={projectChannels}
          activeChannelId={activeChannelId}
          localConfigs={localConfigs}
          anchorRect={projectMenuAnchor}
          triggerRef={projectMenuButtonRef}
          onClose={() => setProjectMenuOpen(false)}
          onJoinProject={onJoinChannel}
          onSwitchChannel={onSwitchChannel}
        />
      )}
    </>
  );
}
