import { FiPlus, FiUsers, FiMessageCircle, FiTrash2, FiHash, FiLayers, FiFolder } from 'react-icons/fi';
import type { AiChat, Channel, ChannelType, DragTarget } from '../types';
import { Tooltip } from './Tooltip';

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
  onOpenSettings,
  onRunStartupScripts,
  onCreateTeam,
  onCreateProject,
  onSwitchAiChat,
  onCreateAiChat,
  onDeleteAiChat,
  onStartDrag,
}: ChannelPanelProps) {
  const teamChannels = channels.filter((c) => c.type === 'team');
  const projectChannels = channels.filter((c) => c.type === 'project');

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
          {/* Channels (placeholder) */}
          <div className="mt-1 mb-1 flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <FiHash className="h-3 w-3 text-[#565f89]" />
              <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">Channels</h2>
            </div>
          </div>
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-[#565f89]">Coming soon</span>
          </div>

          {/* Teams */}
          <div className="mt-4 mb-1 flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <FiLayers className="h-3 w-3 text-[#565f89]" />
              <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">Teams</h2>
            </div>
            <Tooltip text="Create team" position="bottom">
              <button
                type="button"
                onClick={onCreateTeam}
                className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
              >
                <FiPlus className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          {teamChannels.length === 0 ? (
            <div className="px-3 py-1.5">
              <span className="text-xs italic text-[#565f89]">No teams yet</span>
            </div>
          ) : (
            renderChannelItems(teamChannels)
          )}

          {/* Projects */}
          <div className="mt-4 mb-1 flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <FiFolder className="h-3 w-3 text-[#565f89]" />
              <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">Projects</h2>
            </div>
            <Tooltip text="Create project" position="bottom">
              <button
                type="button"
                onClick={onCreateProject}
                className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
              >
                <FiPlus className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          {projectChannels.length === 0 ? (
            <div className="px-3 py-1.5">
              <span className="text-xs italic text-[#565f89]">No projects yet</span>
            </div>
          ) : (
            renderChannelItems(projectChannels)
          )}

          {/* Direct Messages placeholder */}
          <div className="mt-4 mb-1 flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <FiUsers className="h-3 w-3 text-[#565f89]" />
              <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">Direct Messages</h2>
            </div>
            <Tooltip text="New DM" position="bottom">
              <button
                type="button"
                className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
              >
                <FiPlus className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <div className="px-3 py-1.5">
            <span className="text-xs italic text-[#565f89]">Coming soon</span>
          </div>

          {/* AI Chats */}
          <div className="mt-4 mb-1 flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <FiMessageCircle className="h-3 w-3 text-[#565f89]" />
              <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">AI Chats</h2>
            </div>
            <Tooltip text="New AI chat" position="bottom">
              <button
                type="button"
                onClick={onCreateAiChat}
                className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#bb9af7]"
              >
                <FiPlus className="h-3 w-3" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          {aiChats.map((chat) => {
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
