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
    <div className="flex w-[60px] shrink-0 flex-col items-center border-r border-edge bg-surface-deep py-3 gap-2 overflow-y-auto">
      {servers.map((server) => {
        const isActive = server.id === activeServerId;
        return (
          <div key={server.id} className="group relative flex items-center justify-center">
            {/* Active/hover pill indicator on left edge */}
            <div
              className={`absolute left-0 w-[3px] rounded-r-full bg-[#a1a1aa] transition-all ${
                isActive ? 'h-[20px]' : 'h-0 group-hover:h-[8px]'
              }`}
            />
            <button
              type="button"
              onClick={() => onSwitchServer(server.id)}
              title={server.name}
              className={`flex h-[40px] w-[40px] items-center justify-center text-sm font-semibold transition-all ${
                isActive
                  ? 'rounded-[12px] bg-accent text-on-accent'
                  : 'rounded-[20px] bg-surface-elevated text-primary hover:rounded-[12px] hover:bg-accent hover:text-on-accent'
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
        <div className="mx-auto h-px w-8 bg-surface-elevated" />
      )}

      <button
        type="button"
        onClick={onCreateServer}
        title="Create server"
        className="flex h-[40px] w-[40px] items-center justify-center rounded-[20px] bg-surface-elevated text-muted transition-all hover:rounded-[12px] hover:bg-[#9ece6a] hover:text-on-accent"
      >
        <FiPlus className="h-5 w-5" />
      </button>

    </div>
  );
}
