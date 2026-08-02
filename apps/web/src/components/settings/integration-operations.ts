import { gql } from "@urql/core";

export const INTEGRATION_CONNECTIONS_QUERY = gql`
  query IntegrationConnections {
    nangoIntegrationConfigured
    integrationConnections {
      id
      ownerUserId
      provider
      providerConfigKey
      displayName
      kind
      status
      lastError
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_NANGO_CONNECT_SESSION_MUTATION = gql`
  mutation CreateNangoConnectSession($input: CreateNangoConnectSessionInput!) {
    createNangoConnectSession(input: $input) {
      connectLink
      expiresAt
    }
  }
`;

export const DELETE_INTEGRATION_CONNECTION_MUTATION = gql`
  mutation DeleteIntegrationConnection($id: ID!) {
    deleteIntegrationConnection(id: $id)
  }
`;
