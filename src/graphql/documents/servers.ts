import { gql } from 'urql';

export const SERVERS_QUERY = gql`
  query Servers {
    servers {
      id
      name
      avatarUrl
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_SERVER_MUTATION = gql`
  mutation CreateServer($name: String!, $avatarUrl: String) {
    createServer(name: $name, avatarUrl: $avatarUrl) {
      id
      name
      avatarUrl
      createdAt
      updatedAt
      channels {
        id
      }
    }
  }
`;
