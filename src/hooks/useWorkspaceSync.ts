import { useCallback } from 'react';
import { gql } from '@apollo/client';
import type { Workspace } from '../types';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import { useWorkspacesLazyQuery } from './__generated__/useMessages.generated';
import { useWorkspaceStore } from '../stores/workspaceStore';

const GQL_WORKSPACES = gql`
  query Workspaces($channelId: ID!, $limit: Int, $offset: Int) {
    workspaces(channelId: $channelId, limit: $limit, offset: $offset) {
      workspaces {
        ...WorkspaceFields
      }
      total
      limit
      offset
    }
  }
  ${WORKSPACE_FIELDS}
`;

export function useWorkspaceSync() {
  const [executeWorkspaces] = useWorkspacesLazyQuery();

  const refreshWorkspaces = useCallback(async (channelId: string) => {
    try {
      const { data } = await executeWorkspaces({
        variables: { channelId, limit: 200 },
      });
      if (!data) return;

      const fetched = [...data.workspaces.workspaces].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ) as Workspace[];
      useWorkspaceStore.getState().setWorkspaces(fetched);
    } catch (err) {
      console.error('[useWorkspaceSync] refreshWorkspaces failed:', err);
    }
  }, [executeWorkspaces]);

  return { refreshWorkspaces };
}
