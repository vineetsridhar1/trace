import { gql } from 'urql';

export const CHANNELS_QUERY = gql`
  query Channels {
    channels {
      id
      serverId
      name
      baseBranch
      githubUrl
      createdAt
      updatedAt
    }
  }
`;

export const CHANNEL_QUERY = gql`
  query Channel($id: ID!) {
    channel(id: $id) {
      id
      serverId
      name
      baseBranch
      githubUrl
      createdAt
      updatedAt
    }
  }
`;

export const VALIDATE_REPO_QUERY = gql`
  query ValidateRepo($localRepoPath: String!) {
    validateRepo(localRepoPath: $localRepoPath) {
      valid
      originUrl
      error
    }
  }
`;

export const REPO_BRANCHES_QUERY = gql`
  query RepoBranches($localRepoPath: String!) {
    repoBranches(localRepoPath: $localRepoPath)
  }
`;

export const CREATE_CHANNEL_MUTATION = gql`
  mutation CreateChannel($name: String!, $serverId: String, $githubUrl: String, $baseBranch: String) {
    createChannel(name: $name, serverId: $serverId, githubUrl: $githubUrl, baseBranch: $baseBranch) {
      id
      serverId
      name
      baseBranch
      githubUrl
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_CHANNEL_MUTATION = gql`
  mutation UpdateChannel($id: ID!, $name: String, $baseBranch: String, $githubUrl: String) {
    updateChannel(id: $id, name: $name, baseBranch: $baseBranch, githubUrl: $githubUrl) {
      id
      serverId
      name
      baseBranch
      githubUrl
      createdAt
      updatedAt
    }
  }
`;
