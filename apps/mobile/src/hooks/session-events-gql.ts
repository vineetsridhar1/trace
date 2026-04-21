import { gql } from "@urql/core";

export const SESSION_EVENTS_QUERY = gql`
  query MobileSessionEvents(
    $organizationId: ID!
    $scope: ScopeInput
    $limit: Int
    $before: DateTime
    $excludePayloadTypes: [String!]
  ) {
    events(
      organizationId: $organizationId
      scope: $scope
      limit: $limit
      before: $before
      excludePayloadTypes: $excludePayloadTypes
    ) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor { type id name avatarUrl }
      parentId
      timestamp
      metadata
    }
  }
`;

export const SESSION_EVENTS_SUBSCRIPTION = gql`
  subscription MobileSessionEventsLive($sessionId: ID!, $organizationId: ID!) {
    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor { type id name avatarUrl }
      parentId
      timestamp
      metadata
    }
  }
`;

export const SESSION_STATUS_SUBSCRIPTION = gql`
  subscription MobileSessionStatusChanged($sessionId: ID!, $organizationId: ID!) {
    sessionStatusChanged(sessionId: $sessionId, organizationId: $organizationId) {
      id
      agentStatus
      sessionStatus
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
        autoRetryable
      }
    }
  }
`;
