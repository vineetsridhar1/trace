import { useState, useCallback } from 'react';
import { SERVER_URL } from '../types';
import type { StartupScript } from '../types';

export function useChannelSettings() {
  const [scripts, setScripts] = useState<StartupScript[]>([]);

  const fetchScripts = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`${SERVER_URL}/channels/${channelId}/startup-scripts`);
      if (!res.ok) return;
      const { scripts: data } = (await res.json()) as { scripts: StartupScript[] };
      setScripts(data);
    } catch {
      console.error('Failed to fetch startup scripts');
    }
  }, []);

  const updateChannel = useCallback(async (channelId: string, data: { localRepoPath?: string | null; baseBranch?: string | null; creationScript?: string | null }) => {
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

  const addScript = useCallback(async (channelId: string, name: string, command: string) => {
    try {
      const res = await fetch(`${SERVER_URL}/channels/${channelId}/startup-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, command }),
      });
      if (!res.ok) return null;
      const script = (await res.json()) as StartupScript;
      setScripts((prev) => [...prev, script]);
      return script;
    } catch {
      console.error('Failed to add startup script');
      return null;
    }
  }, []);

  const updateScript = useCallback(
    async (channelId: string, scriptId: string, data: { name?: string; command?: string; sortOrder?: number }) => {
      try {
        const res = await fetch(`${SERVER_URL}/channels/${channelId}/startup-scripts/${scriptId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) return null;
        const updated = (await res.json()) as StartupScript;
        setScripts((prev) => prev.map((s) => (s.id === scriptId ? updated : s)));
        return updated;
      } catch {
        console.error('Failed to update startup script');
        return null;
      }
    },
    [],
  );

  const deleteScript = useCallback(async (channelId: string, scriptId: string) => {
    try {
      const res = await fetch(`${SERVER_URL}/channels/${channelId}/startup-scripts/${scriptId}`, {
        method: 'DELETE',
      });
      if (!res.ok) return false;
      setScripts((prev) => prev.filter((s) => s.id !== scriptId));
      return true;
    } catch {
      console.error('Failed to delete startup script');
      return false;
    }
  }, []);

  return { scripts, fetchScripts, updateChannel, addScript, updateScript, deleteScript };
}
