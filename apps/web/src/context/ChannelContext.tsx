import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { useInstanceStore, type InstanceChannel } from '../stores/instanceStore';

export interface ChannelContextValue {
  channels: InstanceChannel[];
  activeChannelId: string | null;
  activeChannel: InstanceChannel | null;
  switchChannel: (id: string) => void;
}

const ChannelContext = createContext<ChannelContextValue | null>(null);

export function ChannelProvider({ children }: { children: ReactNode }) {
  const channels = useInstanceStore((s) => s.channels);
  const activeChannelId = useInstanceStore((s) => s.selectedChannelId);

  const activeChannel = useMemo(
    () => channels.find((ch) => ch.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  const switchChannel = useCallback((id: string) => {
    useInstanceStore.getState().setSelectedChannelId(id);
  }, []);

  const value = useMemo<ChannelContextValue>(
    () => ({
      channels,
      activeChannelId,
      activeChannel,
      switchChannel,
    }),
    [channels, activeChannelId, activeChannel, switchChannel],
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
