import { useCallback, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import type { Workspace } from '../types';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import { type WorkspacesQuery, useWorkspacesLazyQuery } from './__generated__/useMessages.generated';

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

export function useWorkspaces() {
  const [executeWorkspaces] = useWorkspacesLazyQuery();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const workspacesRef = useRef<Workspace[]>([]);
  workspacesRef.current = workspaces;

  const upsertWorkspace = useCallback((workspace: Workspace) => {
    setWorkspaces((current) => {
      const existingIndex = current.findIndex((item) => item.id === workspace.id);
      const next = [...current];

      if (existingIndex >= 0) {
        next[existingIndex] = workspace;
      } else {
        next.push(workspace);
      }

      next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return next;
    });
  }, []);

  const refreshWorkspaces = useCallback(async (channelId: string) => {
    try {
      const { data } = await executeWorkspaces({
        variables: { channelId, limit: 200 },
      });
      if (!data) return;

      const fetched = [...data.workspaces.workspaces].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ) as Workspace[];
      setWorkspaces(fetched);
    } catch (err) {
      console.error('[useWorkspaces] refreshWorkspaces failed:', err);
    }
  }, [executeWorkspaces]);

  const removeWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces((current) => current.filter((item) => item.id !== workspaceId));
  }, []);

  const clearWorkspaces = useCallback(() => {
    setWorkspaces([]);
  }, []);

  return { workspaces, workspacesRef, upsertWorkspace, removeWorkspace, refreshWorkspaces, clearWorkspaces };
}
