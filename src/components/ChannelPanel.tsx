import { useState, useRef } from 'react';
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
  onOpenSettings: (channelId: string) => void;
  onRunStartupScripts: (channelId: string) => void;
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

  const draggedRef = useRef<SidebarSectionId | null>(null);
  const [draggingId, setDraggingId] = useState<SidebarSectionId | null>(null);
  const [dragOverId, setDragOverId] = useState<SidebarSectionId | null>(null);

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
              onClick={(e) => { e.stopPropagation(); onCreateTeam(); }}
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
              onClick={(e) => { e.stopPropagation(); onCreateProject(); }}
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
              onClick={(e) => { e.stopPropagation(); onCreateChannel(); }}
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
              onClick={(e) => { e.stopPropagation(); }}
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
              onClick={(e) => { e.stopPropagation(); onCreateAiChat(); }}
              className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#bb9af7]"
            >
              <FiPlus className="h-3 w-3" aria-hidden="true" />
            </button>
          </Tooltip>
        );
      default:
        return null;
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

  const handleDragStart = (id: SidebarSectionId) => {
    draggedRef.current = id;
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: SidebarSectionId) => {
    e.preventDefault();
    if (draggedRef.current && draggedRef.current !== id) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverId(null);
    }
  };

  const handleDrop = (targetId: SidebarSectionId) => {
    const sourceId = draggedRef.current;
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      setDraggingId(null);
      draggedRef.current = null;
      return;
    }
    const newOrder = [...sectionOrder];
    const sourceIdx = newOrder.indexOf(sourceId);
    const targetIdx = newOrder.indexOf(targetId);
    newOrder.splice(sourceIdx, 1);
    newOrder.splice(targetIdx, 0, sourceId);
    reorder(newOrder);
    setDragOverId(null);
    setDraggingId(null);
    draggedRef.current = null;
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
    draggedRef.current = null;
  };

  return (
    <>
      <div
        id="channel-panel"
        className={`flex min-w-0 flex-col border-r border-[#292e42] bg-[#16161e] ${dragging ? '' : 'panel-animate'}`}
        style={{ width: `${channelWidth}px`, overflow: channelWidth === 0 ? 'hidden' : undefined }}
      >
        {serverName && (
          <div className="border-b border-[#292e42] px-4 pt-3 pb-2">
            <h1 className="truncate text-sm font-bold text-[#c0caf5]">{serverName}</h1>
          </div>
        )}

        <div id="channel-items" className="flex-1 overflow-y-auto px-2 py-1">
          {sectionOrder.map((id) => {
            const config = SECTION_CONFIG[id];
            const Icon = config.icon;
            const isCollapsed = collapsedSections.has(id);
            const isDragging = draggingId === id;
            const isDragOver = dragOverId === id;

            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragOver={(e) => handleDragOver(e, id)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(id)}
                onDragEnd={handleDragEnd}
                className={`mt-1 transition-opacity ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-[#7c3aed]' : 'border-t-2 border-transparent'}`}
              >
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapsed(id)}
                  className="mb-1 flex w-full cursor-pointer items-center justify-between px-2"
                >
                  <div className="flex items-center gap-1.5">
                    <FiChevronRight
                      className={`h-3 w-3 text-[#565f89] transition-transform duration-150 ${!isCollapsed ? 'rotate-90' : ''}`}
                    />
                    <Icon className="h-3 w-3 text-[#565f89]" />
                    <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">
                      {config.label}
                    </h2>
                  </div>
                  {renderActionButton(id)}
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
                >
                  <div className="overflow-hidden">
                    {renderSectionContent(id)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
