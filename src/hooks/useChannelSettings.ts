import { useCallback } from 'react';
import { gql } from '@apollo/client';
import { useUpdateChannelMutation } from './__generated__/useChannelSettings.generated';

const GQL_UPDATE_CHANNEL = gql`
  mutation UpdateChannel($id: ID!, $name: String, $workspacesEnabled: Boolean, $teamIds: [String!], $baseBranch: String, $githubUrl: String, $defaultRepoPath: String, $defaultSetupScript: String, $defaultRunScript: String) {
    updateChannel(id: $id, name: $name, workspacesEnabled: $workspacesEnabled, teamIds: $teamIds, baseBranch: $baseBranch, githubUrl: $githubUrl, defaultRepoPath: $defaultRepoPath, defaultSetupScript: $defaultSetupScript, defaultRunScript: $defaultRunScript) {
      id
      serverId
      name
      type
      workspacesEnabled
      teamIds
      baseBranch
      githubUrl
      defaultRepoPath
      defaultSetupScript
      defaultRunScript
      createdAt
      updatedAt
    }
  }
`;

export function useChannelSettings() {
  const [executeUpdateChannel] = useUpdateChannelMutation();

  const updateChannel = useCallback(async (channelId: string, data: {
    name?: string;
    workspacesEnabled?: boolean;
    teamIds?: string[];
    baseBranch?: string | null;
    githubUrl?: string | null;
    defaultRepoPath?: string | null;
    defaultSetupScript?: string | null;
    defaultRunScript?: string | null;
  }) => {
    try {
      const result = await executeUpdateChannel({ variables: { id: channelId, ...data } });
      if (result.errors?.length) return null;
      return result.data?.updateChannel ?? null;
    } catch {
      console.error('Failed to update channel');
      return null;
    }
  }, [executeUpdateChannel]);

  return { updateChannel };
}
