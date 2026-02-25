import { useCallback, useEffect, useState } from 'react';
import { useQuery } from 'urql';
import type { Channel } from '../types';
import { CHANNELS_QUERY } from '../graphql/documents/channels';

export function useChannels() {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const [{ data }, reexecuteQuery] = useQuery({ query: CHANNELS_QUERY });
  const channels: Channel[] = data?.channels ?? [];

  const activeChannel = channels.find((ch) => ch.id === activeChannelId) ?? null;

  useEffect(() => {
    if (channels.length > 0 && !activeChannelId) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  const switchChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
  }, []);

  const refreshChannels = useCallback(() => {
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery]);

  return { channels, activeChannelId, activeChannel, switchChannel, refreshChannels };
}
