import { useCallback, useEffect, useState } from 'react';
import { gql } from '@apollo/client';
import type { Server } from '../types';
import { useServersQuery } from './__generated__/useServers.generated';

const GQL_SERVERS = gql`
  query Servers {
    servers {
      id
      name
      avatarUrl
      createdAt
      updatedAt
    }
  }
`;

export function useServers() {
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const { data, refetch } = useServersQuery();
  const servers = (data?.servers ?? []) as Server[];

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;

  useEffect(() => {
    if (servers.length > 0 && !activeServerId) {
      setActiveServerId(servers[0].id);
    }
  }, [servers, activeServerId]);

  const switchServer = useCallback((serverId: string) => {
    setActiveServerId(serverId);
  }, []);

  const refreshServers = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    servers,
    activeServerId,
    activeServer,
    switchServer,
    refreshServers,
  };
}
