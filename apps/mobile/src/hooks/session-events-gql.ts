import { gql } from "@urql/core";

export const SESSION_TIMELINE_QUERY = gql`
  query MobileSessionTimeline(
    $organizationId: ID!
    $sessionId: ID!
    $limit: Int
    $before: DateTime
    $beforeEventId: ID
    $excludePayloadTypes: [String!]
  ) {
    sessionTimeline(
      organizationId: $organizationId
      sessionId: $sessionId
      limit: $limit
      before: $before
      beforeEventId: $beforeEventId
      excludePayloadTypes: $excludePayloadTypes
    ) {
      mode
      hasOlder
      items {
        id
        kind
        event {
          id
          scopeType
          scopeId
          eventType
          payload
          actor {
            type
            id
            name
            avatarUrl
          }
          parentId
          timestamp
          metadata
        }
        collapsed {
          id
          startEventId
          startTimestamp
          endEventId
          endTimestamp
        }
      }
    }
  }
`;

export const SESSION_EVENTS_QUERY = gql`
  query MobileSessionEvents(
    $organizationId: ID!
    $scope: ScopeInput
    $limit: Int
    $after: DateTime
    $afterEventId: ID
    $before: DateTime
    $beforeEventId: ID
    $excludePayloadTypes: [String!]
  ) {
    events(
      organizationId: $organizationId
      scope: $scope
      limit: $limit
      after: $after
      afterEventId: $afterEventId
      before: $before
      beforeEventId: $beforeEventId
      excludePayloadTypes: $excludePayloadTypes
    ) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
        name
        avatarUrl
      }
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
      actor {
        type
        id
        name
        avatarUrl
      }
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

export const SESSION_PORTS_SUBSCRIPTION = gql`
  subscription MobileSessionPortsChanged($sessionId: ID!, $organizationId: ID!) {
    sessionPortsChanged(sessionId: $sessionId, organizationId: $organizationId) {
      terminals {
        id
        wsUrl
        status
      }
      ports {
        port
        url
        label
        status
      }
    }
  }
`;
