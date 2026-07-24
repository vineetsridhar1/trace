import { gql } from "@urql/core";

export const SERVICE_ACCESS_TOKENS_QUERY = gql`
  query ServiceAccessTokens($organizationId: ID!) {
    serviceAccessTokens(organizationId: $organizationId) {
      id
      organizationId
      createdById
      name
      tokenPrefix
      scopes
      expiresAt
      revokedAt
      lastUsedAt
      createdAt
      updatedAt
      createdBy {
        id
        name
        email
        avatarUrl
      }
    }
  }
`;

export const CREATE_SERVICE_ACCESS_TOKEN = gql`
  mutation CreateServiceAccessToken($input: CreateServiceAccessTokenInput!) {
    createServiceAccessToken(input: $input) {
      token
    }
  }
`;

export const REVOKE_SERVICE_ACCESS_TOKEN = gql`
  mutation RevokeServiceAccessToken($id: ID!) {
    revokeServiceAccessToken(id: $id)
  }
`;
