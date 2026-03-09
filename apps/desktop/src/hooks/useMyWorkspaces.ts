import { useCallback } from 'react';
import { gql } from '@apollo/client';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import { useMyWorkspacesLazyQuery, useMyWorkspacesMergedCountLazyQuery } from './__generated__/useMyWorkspaces.generated';
import { useMyActivityStore } from '../stores/myActivityStore';
import type { Workspace } from '../types';

const GQL_MY_WORKSPACES = gql`
  query MyWorkspaces($serverId: ID!, $excludeStatuses: [String!]) {
    myWorkspaces(serverId: $serverId, excludeStatuses: $excludeStatuses) {
      ...WorkspaceFields
      channelName
    }
  }
  ${WORKSPACE_FIELDS}
`;

const GQL_MY_WORKSPACES_MERGED_COUNT = gql`
  query MyWorkspacesMergedCount($serverId: ID!) {
    myWorkspacesMergedCount(serverId: $serverId)
  }
`;

export function useMyWorkspaces() {
  const [executeMyWorkspaces] = useMyWorkspacesLazyQuery();
  const [executeMergedCount] = useMyWorkspacesMergedCountLazyQuery();

  const refreshMyWorkspaces = useCallback(
    async (serverId: string, excludeStatuses?: string[]) => {
      const store = useMyActivityStore.getState();
      store.setLoading(true);
      store.setError(null);
      try {
        const [workspacesResult, countResult] = await Promise.all([
          executeMyWorkspaces({
            variables: { serverId, excludeStatuses: excludeStatuses ?? ['merged'] },
            fetchPolicy: 'network-only',
          }),
          executeMergedCount({
            variables: { serverId },
            fetchPolicy: 'network-only',
          }),
        ]);
        if (workspacesResult.error) throw workspacesResult.error;
        if (countResult.error) throw countResult.error;
        store.setWorkspaces((workspacesResult.data?.myWorkspaces ?? []) as Workspace[]);
        store.setMergedCount(countResult.data?.myWorkspacesMergedCount ?? 0);
      } catch (err) {
        console.error('[useMyWorkspaces] refreshMyWorkspaces failed:', err);
        store.setError('Failed to load workspaces');
      } finally {
        store.setLoading(false);
      }
    },
    [executeMyWorkspaces, executeMergedCount],
  );

  const loadMergedMyWorkspaces = useCallback(
    async (serverId: string) => {
      const store = useMyActivityStore.getState();
      store.setMergedWorkspacesLoading(true);
      try {
        const result = await executeMyWorkspaces({
          variables: { serverId, excludeStatuses: [] },
          fetchPolicy: 'network-only',
        });
        if (result.error) throw result.error;
        store.setWorkspaces((result.data?.myWorkspaces ?? []) as Workspace[]);
        store.setMergedWorkspacesLoaded(true);
      } catch (err) {
        console.error('[useMyWorkspaces] loadMergedMyWorkspaces failed:', err);
        store.setError('Failed to load merged workspaces');
      } finally {
        store.setMergedWorkspacesLoading(false);
      }
    },
    [executeMyWorkspaces],
  );

  return { refreshMyWorkspaces, loadMergedMyWorkspaces };
}
