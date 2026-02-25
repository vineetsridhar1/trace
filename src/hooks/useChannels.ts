import { useCallback, useEffect, useState } from 'react';
import { gql } from '@apollo/client';
import type { Channel } from '../types';
import { useChannelsQuery } from './__generated__/useChannels.generated';

const GQL_CHANNELS = gql`
  query Channels {
    channels {
      id
      serverId
      name
      baseBranch
      githubUrl
      createdAt
      updatedAt
    }
  }
`;

export function useChannels() {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(
    () => localStorage.getItem('activeChannelId'),
  );

  const { data, refetch } = useChannelsQuery();
  const channels = (data?.channels ?? []) as Channel[];

  const activeChannel = channels.find((ch) => ch.id === activeChannelId) ?? null;

  useEffect(() => {
    if (channels.length === 0) return;
    if (activeChannelId && channels.some((ch) => ch.id === activeChannelId)) return;
    setActiveChannelId(channels[0].id);
  }, [channels, activeChannelId]);

  const switchChannel = useCallback((channelId: string) => {
    localStorage.setItem('activeChannelId', channelId);
    setActiveChannelId(channelId);
  }, []);

  const refreshChannels = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return { channels, activeChannelId, activeChannel, switchChannel, refreshChannels };
}
