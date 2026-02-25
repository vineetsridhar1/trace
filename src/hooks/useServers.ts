import { useCallback, useEffect, useState } from 'react';
import { useQuery } from 'urql';
import type { Server } from '../types';
import { SERVERS_QUERY } from '../graphql/documents/servers';

export function useServers() {
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const [{ data }, reexecuteQuery] = useQuery({ query: SERVERS_QUERY });
  const servers: Server[] = data?.servers ?? [];

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;

  useEffect(() => {
    if (servers.length > 0 && !activeServerId) {
      setActiveServerId(servers[0].id);
    }
  }, [servers, activeServerId]);

  const switchServer = useCallback((serverId: string) => {
    setActiveServerId(serverId);
  }, []);

  const refreshServers = useCallback(() => {
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery]);

  return {
    servers,
    activeServerId,
    activeServer,
    switchServer,
    refreshServers,
  };
}
