import { useCallback } from 'react';
import { SERVER_URL } from '../types';

export function useChannelSettings() {
  const updateChannel = useCallback(async (channelId: string, data: { baseBranch?: string | null; githubUrl?: string | null }) => {
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

  return { updateChannel };
}
