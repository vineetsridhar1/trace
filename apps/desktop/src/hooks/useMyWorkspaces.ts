import { gql } from '@apollo/client';
import { useMyWorkspacesQuery } from './__generated__/useMyWorkspaces.generated';

const GQL_MY_WORKSPACES = gql`
  query MyWorkspaces($serverId: ID!, $excludeStatuses: [String!]) {
    myWorkspaces(serverId: $serverId, excludeStatuses: $excludeStatuses) {
      id
      channelId
      channelName
      preview
      ticketTitle
      status
      importance
      createdAt
    }
  }
`;

export function useMyWorkspaces(serverId: string | null) {
  const { data, loading } = useMyWorkspacesQuery({
    variables: { serverId: serverId!, excludeStatuses: ['merged', 'pending', 'queued'] },
    skip: !serverId,
    pollInterval: 30_000,
  });

  return { workspaces: data?.myWorkspaces ?? [], loading };
}
