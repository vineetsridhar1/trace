import { Reorder } from 'framer-motion';
import { FiPlus, FiUsers, FiMessageCircle, FiTrash2, FiHash, FiLayers, FiFolder, FiChevronRight } from 'react-icons/fi';
import type { AiChat, Channel, DragTarget } from '../types';
import { Tooltip } from './Tooltip';
import { useSidebarPrefs, type SidebarSectionId } from '../hooks/useSidebarPrefs';

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
  serverName?: string;
  aiChats: AiChat[];
  activeAiChatId: string | null;
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
  serverName,
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
}: ChannelPanelProps) {
  const chatChannels = channels.filter((c) => c.type === 'channel');
  const teamChannels = channels.filter((c) => c.type === 'team');
  const projectChannels = channels.filter((c) => c.type === 'project');
  const { sectionOrder, collapsedSections, reorder, toggleCollapsed } = useSidebarPrefs();

  const renderChannelItems = (items: Channel[]) =>
    items.map((channel) => {
      const isActive = channel.id === activeChannelId && !activeAiChatId;
      return (
        <div key={channel.id} className="my-0.5 flex items-center">
          <button
            type="button"
            onClick={() => onSwitchChannel(channel.id)}
            className={`channel-item flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
              isActive ? 'active font-semibold' : 'text-[#a9b1d6]'
            }`}
          >
            <span className="text-xs text-[#565f89]">#</span>
            <span className="truncate">{channel.name}</span>
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
              className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
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
              className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
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
              className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
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
              className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
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
              className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#bb9af7]"
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
            <span className="text-xs italic text-[#565f89]">No channels yet</span>
          </div>
        ) : (
          renderChannelItems(chatChannels)
        );
      case 'teams':
        return teamChannels.length === 0 ? (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-[#565f89]">No teams yet</span>
          </div>
        ) : (
          renderChannelItems(teamChannels)
        );
      case 'projects':
        return projectChannels.length === 0 ? (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-[#565f89]">No projects yet</span>
          </div>
        ) : (
          renderChannelItems(projectChannels)
        );
      case 'dms':
        return (
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-[#565f89]">Coming soon...</span>
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
                  isActive ? 'bg-[#292e42] font-semibold text-[#bb9af7]' : 'text-[#a9b1d6]'
                }`}
              >
                <FiMessageCircle className="h-3 w-3 shrink-0 text-[#565f89]" />
                <span className="truncate">{chat.title}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteAiChat(chat.id);
                }}
                className="mr-1 rounded p-0.5 text-[#565f89] opacity-0 hover:bg-[#292e42] hover:text-[#f7768e] group-hover:opacity-100"
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
        className={`flex min-w-0 flex-col border-r border-[#292e42] bg-[#16161e] ${dragging ? '' : 'panel-animate'}`}
        style={{ width: `${channelWidth}px`, overflow: channelWidth === 0 ? 'hidden' : undefined }}
      >
        {serverName && (
          <div className="flex h-[52px] items-center border-b border-[#292e42] px-4">
            <h1 className="truncate text-sm font-bold text-[#c0caf5]">{serverName}</h1>
          </div>
        )}

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
                className="relative border-b border-[#292e42] bg-[#16161e] py-2 last:border-b-0"
                whileDrag={{ zIndex: 50 }}
              >
                <div className="mb-1 flex w-full items-center justify-between px-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-[#565f89]" />
                    <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">
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
                      className="cursor-pointer rounded p-0.5 text-[#565f89] hover:bg-[#292e42]"
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
