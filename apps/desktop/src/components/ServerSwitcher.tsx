import { useState, useEffect, useRef } from 'react';
import { FiChevronDown, FiCheck, FiPlus } from 'react-icons/fi';
import type { Server } from '../types';

type WsStatus = 'connected' | 'connecting' | 'disconnected';

function useWsConnectionStatus(): WsStatus {
  const [status, setStatus] = useState<WsStatus>('connecting');

  useEffect(() => {
    if (!window.traceAPI?.onWsConnectionStatus) return;
    const unsubscribe = window.traceAPI.onWsConnectionStatus(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

const STATUS_DOT: Record<WsStatus, { className: string; label: string }> = {
  connected: { className: 'bg-green-400', label: 'Connected to server' },
  connecting: { className: 'bg-yellow-400 animate-pulse', label: 'Connecting to server...' },
  disconnected: { className: 'bg-red-400', label: 'Disconnected from server' },
};

interface ServerSwitcherProps {
  servers: Server[];
  activeServerId: string | null;
  activeServer: Server | null;
  onSwitchServer: (serverId: string) => void;
  onCreateServer: () => void;
}

export function ServerSwitcher({
  servers,
  activeServerId,
  activeServer,
  onSwitchServer,
  onCreateServer,
}: ServerSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsStatus = useWsConnectionStatus();
  const dot = STATUS_DOT[wsStatus];

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-[52px] w-full items-center gap-2 border-b border-edge px-4 transition-colors hover:bg-surface-elevated"
      >
        {activeServer?.avatarUrl ? (
          <img
            src={activeServer.avatarUrl}
            alt={activeServer.name}
            className="h-6 w-6 shrink-0 rounded-md object-cover"
          />
        ) : activeServer ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-on-accent">
            {activeServer.name.charAt(0).toUpperCase()}
          </span>
        ) : null}
        <span className="truncate text-sm font-bold text-primary">
          {activeServer?.name ?? 'No server'}
        </span>
        <span
          title={dot.label}
          className={`ml-auto h-2 w-2 shrink-0 rounded-full ${dot.className}`}
        />
        <FiChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 w-full rounded-md border border-edge bg-surface-elevated py-1 shadow-lg">
          {servers.map((server) => {
            const isActive = server.id === activeServerId;
            return (
              <button
                key={server.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSwitchServer(server.id);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/20 text-accent-light'
                    : 'text-primary hover:bg-surface-hover'
                }`}
              >
                {server.avatarUrl ? (
                  <img
                    src={server.avatarUrl}
                    alt={server.name}
                    className="h-5 w-5 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent text-[10px] font-semibold text-on-accent">
                    {server.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate">{server.name}</span>
                {isActive && (
                  <FiCheck className="ml-auto h-3.5 w-3.5 shrink-0 text-accent-light" aria-hidden="true" />
                )}
              </button>
            );
          })}

          {servers.length > 0 && <div className="mx-2 my-1 h-px bg-edge" />}

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onCreateServer();
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          >
            <FiPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Add a server</span>
          </button>
        </div>
      )}
    </div>
  );
}
