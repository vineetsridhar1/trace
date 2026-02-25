import { useCallback } from 'react';
import { useMutation } from 'urql';
import { UPDATE_CHANNEL_MUTATION } from '../graphql/documents/channels';

export function useChannelSettings() {
  const [, executeUpdateChannel] = useMutation(UPDATE_CHANNEL_MUTATION);

  const updateChannel = useCallback(async (channelId: string, data: { baseBranch?: string | null; githubUrl?: string | null }) => {
    try {
      const result = await executeUpdateChannel({ id: channelId, ...data });
      if (result.error) return null;
      return result.data?.updateChannel ?? null;
    } catch {
      console.error('Failed to update channel');
      return null;
    }
  }, [executeUpdateChannel]);

  return { updateChannel };
}
