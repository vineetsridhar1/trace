import type { Channel, DragTarget } from '../types';

interface ChannelPanelProps {
  channels: Channel[];
  activeChannelId: string | null;
  channelWidth: number;
  dragging: DragTarget;
  onSwitchChannel: (id: string) => void;
  onStartDrag: () => void;
}

export function ChannelPanel({
  channels,
  activeChannelId,
  channelWidth,
  dragging,
  onSwitchChannel,
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
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => onSwitchChannel(channel.id)}
                className={`channel-item my-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive ? 'active font-semibold' : 'text-[#a9b1d6]'
                }`}
              >
                <span className="text-xs text-[#565f89]">#</span>
                {channel.name}
              </button>
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
