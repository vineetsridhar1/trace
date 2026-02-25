import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Channel, LocalChannelConfig, Server } from '../types';
import { SERVER_URL } from '../types';
import { useChannels } from '../hooks/useChannels';
import { useServers } from '../hooks/useServers';
import { useLocalConfig } from '../hooks/useLocalConfig';

export interface ChannelContextValue {
  // Servers
  servers: Server[];
  activeServerId: string | null;
  activeServer: Server | null;
  switchServer: (id: string) => void;
  refreshServers: () => Promise<void>;
  // Channels
  channels: Channel[];
  enrichedChannels: Channel[];
  serverChannels: Channel[];
  activeChannelId: string | null;
  enrichedActiveChannel: Channel | null;
  switchChannel: (id: string) => void;
  refreshChannels: () => Promise<void>;
  // Local config
  localConfigs: Record<string, LocalChannelConfig>;
  getLocalConfig: (channelId: string) => LocalChannelConfig | null;
  setLocalConfig: (channelId: string, data: LocalChannelConfig) => Promise<void>;
  // Channel settings
  updateChannelSettings: (channelId: string, data: { baseBranch?: string | null }) => Promise<unknown>;
}

const ChannelContext = createContext<ChannelContextValue | null>(null);

export function ChannelProvider({ children }: { children: ReactNode }) {
  const {
    channels,
    activeChannelId,
    switchChannel,
    refreshChannels,
  } = useChannels();

  const {
    servers,
    activeServerId,
    activeServer,
    switchServer,
    refreshServers,
  } = useServers();

  const {
    configs: localConfigs,
    getConfig: getLocalConfig,
    setConfig: setLocalConfig,
  } = useLocalConfig();

  const enrichedChannels: Channel[] = useMemo(
    () =>
      channels.map((ch) => {
        const local = localConfigs[ch.id];
        if (!local) return ch;
        return {
          ...ch,
          localRepoPath: local.localRepoPath ?? ch.localRepoPath,
          creationScript: local.creationScript ?? ch.creationScript,
        };
      }),
    [channels, localConfigs],
  );

  const serverChannels = useMemo(
    () => (activeServerId ? enrichedChannels.filter((ch) => ch.serverId === activeServerId) : enrichedChannels),
    [enrichedChannels, activeServerId],
  );

  const enrichedActiveChannel = useMemo(
    () => enrichedChannels.find((ch) => ch.id === activeChannelId) ?? null,
    [enrichedChannels, activeChannelId],
  );

  // One-time migration: copy DB localRepoPath/creationScript into local config
  const migrationRanRef = useRef(false);
  useEffect(() => {
    if (migrationRanRef.current || channels.length === 0 || Object.keys(localConfigs).length > 0) return;
    migrationRanRef.current = true;

    const migrateChannels = async () => {
      for (const ch of channels) {
        if (ch.localRepoPath && !localConfigs[ch.id]) {
          const config: LocalChannelConfig = {
            localRepoPath: ch.localRepoPath,
            creationScript: ch.creationScript ?? undefined,
          };
          try {
            const res = await fetch(`${SERVER_URL}/channels/${ch.id}/startup-scripts`);
            if (res.ok) {
              const data = (await res.json()) as { scripts: { name: string; command: string }[] };
              if (data.scripts.length > 0) {
                config.startupScripts = data.scripts.map((s) => ({ name: s.name, command: s.command }));
              }
            }
          } catch {
            // ignore migration errors
          }
          await setLocalConfig(ch.id, config);
        }
      }
    };
    void migrateChannels();
  }, [channels, localConfigs, setLocalConfig]);

  const updateChannelSettings = useCallback(async (channelId: string, data: { baseBranch?: string | null }) => {
    try {
      const res = await fetch(`${SERVER_URL}/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      console.error('Failed to update channel');
      return null;
    }
  }, []);

  const value = useMemo<ChannelContextValue>(
    () => ({
      servers,
      activeServerId,
      activeServer,
      switchServer,
      refreshServers,
      channels,
      enrichedChannels,
      serverChannels,
      activeChannelId,
      enrichedActiveChannel,
      switchChannel,
      refreshChannels,
      localConfigs,
      getLocalConfig,
      setLocalConfig,
      updateChannelSettings,
    }),
    [
      servers,
      activeServerId,
      activeServer,
      switchServer,
      refreshServers,
      channels,
      enrichedChannels,
      serverChannels,
      activeChannelId,
      enrichedActiveChannel,
      switchChannel,
      refreshChannels,
      localConfigs,
      getLocalConfig,
      setLocalConfig,
      updateChannelSettings,
    ],
  );

  return (
    <ChannelContext.Provider value={value}>
      {children}
    </ChannelContext.Provider>
  );
}

export function useChannelContext() {
  const context = useContext(ChannelContext);
  if (!context) {
    throw new Error('useChannelContext must be used within ChannelProvider');
  }
  return context;
}
