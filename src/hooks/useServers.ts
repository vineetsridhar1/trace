import { useCallback, useEffect, useState } from 'react';
import type { Server } from '../types';
import { SERVER_URL } from '../types';

export function useServers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/servers`);
      if (!res.ok) return;

      const { servers: fetched } = (await res.json()) as { servers: Server[] };
      setServers(fetched);

      setActiveServerId((current) => {
        if (current) return current;
        return fetched.length > 0 ? fetched[0].id : null;
      });
    } catch {
      // Server may not be up yet.
    }
  }, []);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  const switchServer = useCallback((serverId: string) => {
    setActiveServerId(serverId);
  }, []);

  return {
    servers,
    activeServerId,
    activeServer,
    switchServer,
    refreshServers: fetchServers,
  };
}
