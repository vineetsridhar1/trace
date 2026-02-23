import type { Channel, DragTarget } from '../types';

interface ChannelPanelProps {
  channels: Channel[];
  activeChannelId: string | null;
  channelWidth: number;
  dragging: DragTarget;
  onSwitchChannel: (id: string) => void;
  onOpenSettings: (channelId: string) => void;
  onRunStartupScripts: (channelId: string) => void;
  onStartDrag: () => void;
}

export function ChannelPanel({
  channels,
  activeChannelId,
  channelWidth,
  dragging,
  onSwitchChannel,
  onOpenSettings,
  onRunStartupScripts,
  onStartDrag,
}: ChannelPanelProps) {
  return (
    <>
      <div
        id="channel-panel"
        className={`flex min-w-0 flex-col border-r border-[#292e42] bg-[#16161e] ${dragging ? '' : 'panel-animate'}`}
        style={{ width: `${channelWidth}px`, overflow: channelWidth === 0 ? 'hidden' : undefined }}
      >
        <div className="border-b border-[#292e42] px-4 pt-3 pb-2">
          <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">Channels</h2>
        </div>

        <div id="channel-items" className="flex-1 overflow-y-auto px-2 py-1">
          {channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
            const hasScriptSetup = !!channel.cwd;
            return (
              <div key={channel.id} className="group my-0.5 flex items-center">
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
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {hasScriptSetup && (
                    <button
                      type="button"
                      title="Run startup scripts"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunStartupScripts(channel.id);
                      }}
                      className="rounded p-1 text-[#565f89] hover:bg-[#292e42] hover:text-[#9ece6a]"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 1.5l7 4.5-7 4.5V1.5z" fill="currentColor" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    title="Channel settings"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSettings(channel.id);
                    }}
                    className="rounded p-1 text-[#565f89] hover:bg-[#292e42] hover:text-[#c0caf5]"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M6 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                      <path
                        d="M10.2 7.4l-.7-.4a.5.5 0 01-.2-.6l.3-.8a.5.5 0 00-.1-.5l-.6-.6a.5.5 0 00-.5-.1l-.8.3a.5.5 0 01-.6-.2l-.4-.7a.5.5 0 00-.4-.3h-.8a.5.5 0 00-.4.3l-.4.7a.5.5 0 01-.6.2l-.8-.3a.5.5 0 00-.5.1l-.6.6a.5.5 0 00-.1.5l.3.8a.5.5 0 01-.2.6l-.7.4a.5.5 0 00-.3.4v.8a.5.5 0 00.3.4l.7.4a.5.5 0 01.2.6l-.3.8a.5.5 0 00.1.5l.6.6a.5.5 0 00.5.1l.8-.3a.5.5 0 01.6.2l.4.7a.5.5 0 00.4.3h.8a.5.5 0 00.4-.3l.4-.7a.5.5 0 01.6-.2l.8.3a.5.5 0 00.5-.1l.6-.6a.5.5 0 00.1-.5l-.3-.8a.5.5 0 01.2-.6l.7-.4a.5.5 0 00.3-.4v-.8a.5.5 0 00-.3-.4z"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                    </svg>
                  </button>
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
