import { gql } from "@urql/core";

const EVENT_FIELDS = `
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
`;

export const SESSION_TIMELINE_QUERY = gql`
  query SessionTimeline(
    $organizationId: ID!
    $sessionId: ID!
    $limit: Int
    $excludePayloadTypes: [String!]
  ) {
    sessionTimeline(
      organizationId: $organizationId
      sessionId: $sessionId
      limit: $limit
      excludePayloadTypes: $excludePayloadTypes
    ) {
      items {
        kind
        event {
          ${EVENT_FIELDS}
        }
      }
    }
  }
`;

export const SESSION_EVENTS_SUBSCRIPTION = gql`
  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {
    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {
      ${EVENT_FIELDS}
    }
  }
`;

export const CHANNEL_EVENTS_SUBSCRIPTION = gql`
  subscription ChannelEventsLive($channelId: ID!, $organizationId: ID!) {
    channelEvents(channelId: $channelId, organizationId: $organizationId) {
      ${EVENT_FIELDS}
    }
  }
`;

export const CHAT_EVENTS_SUBSCRIPTION = gql`
  subscription ChatEventsLive($chatId: ID!) {
    chatEvents(chatId: $chatId) {
      ${EVENT_FIELDS}
    }
  }
`;

export const HYDRATE_CHANNELS_QUERY = gql`
  query HydrateChannels($orgId: ID!) {
    channels(organizationId: $orgId) {
      id
      name
      type
      memberCount
      repo {
        id
        name
      }
    }
  }
`;

export const HYDRATE_SESSIONS_QUERY = gql`
  query HydrateSessions($orgId: ID!) {
    sessions(organizationId: $orgId) {
      id
      name
      agentStatus
      sessionStatus
      tool
      model
      branch
      workdir
      prUrl
      worktreeDeleted
      sessionGroupId
      lastMessageAt
      updatedAt
      repo {
        id
        name
      }
      connection {
        state
        runtimeInstanceId
        runtimeLabel
      }
    }
  }
`;

export const HYDRATE_TICKETS_QUERY = gql`
  query HydrateTickets($orgId: ID!) {
    tickets(organizationId: $orgId) {
      id
      title
      status
      priority
      updatedAt
    }
  }
`;

export const HYDRATE_REPOS_QUERY = gql`
  query HydrateRepos($orgId: ID!) {
    repos(organizationId: $orgId) {
      id
      name
    }
  }
`;
