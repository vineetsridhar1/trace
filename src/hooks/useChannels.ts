import { useCallback, useEffect, useState } from 'react';
import type { Channel } from '../types';
import { SERVER_URL } from '../types';

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const activeChannel = channels.find((ch) => ch.id === activeChannelId) ?? null;

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/channels`);
      if (!res.ok) return;

      const { channels: fetched } = await res.json();
      const typed = fetched as Channel[];
      setChannels(typed);

      setActiveChannelId((current) => {
        if (current) return current;
        return typed.length > 0 ? typed[0].id : null;
      });
    } catch {
      // Server may not be up yet.
    }
  }, []);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const switchChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
  }, []);

  return { channels, activeChannelId, activeChannel, switchChannel, refreshChannels: fetchChannels };
}
