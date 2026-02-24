import type { Channel, DragTarget } from '../types';

interface ChannelPanelProps {
  channels: Channel[];
  activeChannelId: string | null;
  channelWidth: number;
  dragging: DragTarget;
  onSwitchChannel: (id: string) => void;
  onOpenSettings: (channelId: string) => void;
  onRunStartupScripts: (channelId: string) => void;
  onCreateChannel: () => void;
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
  onCreateChannel,
  onStartDrag,
}: ChannelPanelProps) {
  return (
    <>
      <div
        id="channel-panel"
        className={`flex min-w-0 flex-col border-r border-[#292e42] bg-[#16161e] ${dragging ? '' : 'panel-animate'}`}
        style={{ width: `${channelWidth}px`, overflow: channelWidth === 0 ? 'hidden' : undefined }}
      >
        <div className="flex items-center justify-between border-b border-[#292e42] px-4 pt-3 pb-2">
          <h2 className="text-xs font-semibold tracking-wide text-[#565f89] uppercase">Channels</h2>
          <button
            type="button"
            title="Create channel"
            onClick={onCreateChannel}
            className="rounded p-0.5 text-[#565f89] hover:bg-[#292e42] hover:text-[#7aa2f7]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div id="channel-items" className="flex-1 overflow-y-auto px-2 py-1">
          {channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
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
