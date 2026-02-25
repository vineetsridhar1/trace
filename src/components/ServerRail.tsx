import { FiPlus } from 'react-icons/fi';
import type { Server } from '../types';

interface ServerRailProps {
  servers: Server[];
  activeServerId: string | null;
  onSwitchServer: (serverId: string) => void;
  onCreateServer: () => void;
}

export function ServerRail({
  servers,
  activeServerId,
  onSwitchServer,
  onCreateServer,
}: ServerRailProps) {
  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center border-r border-[#292e42] bg-[#13141e] py-3 gap-2 overflow-y-auto">
      {servers.map((server) => {
        const isActive = server.id === activeServerId;
        return (
          <div key={server.id} className="group relative flex items-center justify-center">
            {/* Active/hover pill indicator on left edge */}
            <div
              className={`absolute left-0 w-[3px] rounded-r-full bg-[#c0caf5] transition-all ${
                isActive ? 'h-[20px]' : 'h-0 group-hover:h-[8px]'
              }`}
            />
            <button
              type="button"
              onClick={() => onSwitchServer(server.id)}
              title={server.name}
              className={`flex h-[40px] w-[40px] items-center justify-center text-sm font-semibold transition-all ${
                isActive
                  ? 'rounded-[12px] bg-[#7aa2f7] text-[#1a1b26]'
                  : 'rounded-[20px] bg-[#292e42] text-[#a9b1d6] hover:rounded-[12px] hover:bg-[#7aa2f7] hover:text-[#1a1b26]'
              }`}
            >
              {server.avatarUrl ? (
                <img
                  src={server.avatarUrl}
                  alt={server.name}
                  className="h-full w-full rounded-[inherit] object-cover"
                />
              ) : (
                <span>{server.name.charAt(0).toUpperCase()}</span>
              )}
            </button>
          </div>
        );
      })}

      {servers.length > 0 && (
        <div className="mx-auto h-px w-8 bg-[#292e42]" />
      )}

      <button
        type="button"
        onClick={onCreateServer}
        title="Create server"
        className="flex h-[40px] w-[40px] items-center justify-center rounded-[20px] bg-[#292e42] text-[#565f89] transition-all hover:rounded-[12px] hover:bg-[#9ece6a] hover:text-[#1a1b26]"
      >
        <FiPlus className="h-5 w-5" />
      </button>
    </div>
  );
}
