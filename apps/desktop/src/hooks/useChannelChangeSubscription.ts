import { useEffect } from 'react';
import { gql, useSubscription } from '@apollo/client';

const CHANNEL_CHANGED_IN_SERVER_SUBSCRIPTION = gql`
  subscription ChannelChangedInServer($serverId: ID!) {
    channelChangedInServer(serverId: $serverId) {
      channelId
      action
    }
  }
`;

interface UseChannelChangeSubscriptionOptions {
  activeServerId: string | null;
  refreshChannels: () => Promise<void>;
}

export function useChannelChangeSubscription({
  activeServerId,
  refreshChannels,
}: UseChannelChangeSubscriptionOptions) {
  const skip = !activeServerId;
  const { data } = useSubscription(CHANNEL_CHANGED_IN_SERVER_SUBSCRIPTION, {
    variables: { serverId: activeServerId ?? '' },
    skip,
  });

  useEffect(() => {
    if (!data?.channelChangedInServer) return;
    void refreshChannels();
  }, [data, refreshChannels]);
}
