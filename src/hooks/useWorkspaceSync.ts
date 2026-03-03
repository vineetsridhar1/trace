import { useCallback } from 'react';
import { gql } from '@apollo/client';
import type { Workspace } from '../types';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import { useWorkspacesLazyQuery } from './__generated__/useMessages.generated';
import { useWorkspaceStore } from '../stores/workspaceStore';

const GQL_WORKSPACES = gql`
  query Workspaces($channelId: ID!, $limit: Int, $offset: Int, $excludeStatus: String) {
    workspaces(channelId: $channelId, limit: $limit, offset: $offset, excludeStatus: $excludeStatus) {
      workspaces {
        ...WorkspaceFields
      }
      total
      mergedCount
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
        variables: { channelId, limit: 200, excludeStatus: 'merged' },
      });
      if (!data) return;

      const fetched = [...data.workspaces.workspaces].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ) as Workspace[];
      useWorkspaceStore.getState().setWorkspaces(fetched);
      useWorkspaceStore.getState().setMergedCount(data.workspaces.mergedCount);
      useWorkspaceStore.getState().setMergedWorkspacesLoaded(false);
    } catch (err) {
      console.error('[useWorkspaceSync] refreshWorkspaces failed:', err);
    }
  }, [executeWorkspaces]);

  const loadMergedWorkspaces = useCallback(async (channelId: string) => {
    if (useWorkspaceStore.getState().mergedWorkspacesLoading) return;
    useWorkspaceStore.getState().setMergedWorkspacesLoading(true);
    try {
      const { data } = await executeWorkspaces({
        variables: { channelId, limit: 200 },
        fetchPolicy: 'network-only',
      });
      if (!data) return;

      const fetched = [...data.workspaces.workspaces].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ) as Workspace[];
      useWorkspaceStore.getState().setWorkspaces(fetched);
      useWorkspaceStore.getState().setMergedCount(data.workspaces.mergedCount);
      useWorkspaceStore.getState().setMergedWorkspacesLoaded(true);
    } catch (err) {
      console.error('[useWorkspaceSync] loadMergedWorkspaces failed:', err);
    } finally {
      useWorkspaceStore.getState().setMergedWorkspacesLoading(false);
    }
  }, [executeWorkspaces]);

  return { refreshWorkspaces, loadMergedWorkspaces };
}
