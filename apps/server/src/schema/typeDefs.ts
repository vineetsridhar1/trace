const baseTypeDefs = `#graphql
  scalar DateTime
  scalar JSON

  enum SessionStatus {
    active
    paused
    completed
    failed
    unreachable
  }

  enum TicketStatus {
    backlog
    todo
    in_progress
    in_review
    done
    cancelled
  }

  enum Priority {
    urgent
    high
    medium
    low
  }

  enum HostingMode {
    cloud
    local
  }

  enum CodingTool {
    claude_code
    cursor
    custom
  }

  enum ChannelType {
    default
    announcement
    triage
    feed
  }

  enum ScopeType {
    channel
    session
    ticket
    system
  }

  enum ActorType {
    user
    agent
    system
  }

  enum EntityType {
    session
    ticket
    channel
  }

  type Actor {
    type: ActorType!
    id: ID!
  }

  type TerminalEndpoint {
    id: String!
    wsUrl: String!
    status: String!
  }

  type PortEndpoint {
    port: Int!
    url: String!
    label: String!
    status: String!
  }

  type SessionEndpoints {
    terminals: [TerminalEndpoint!]!
    ports: [PortEndpoint!]!
  }

  type SessionConnection {
    lastSeen: DateTime
    bridgeVersion: String
  }

  type Notification {
    id: ID!
    type: String!
    message: String!
    timestamp: DateTime!
  }
`;

const organizationTypeDefs = `#graphql
  type Organization {
    id: ID!
    name: String!
    members: [User!]!
    repos: [Repo!]!
    projects: [Project!]!
    channels: [Channel!]!
  }
`;

const userTypeDefs = `#graphql
  type User {
    id: ID!
    email: String!
    name: String!
    role: String!
  }
`;

const repoTypeDefs = `#graphql
  type Repo {
    id: ID!
    name: String!
    remoteUrl: String!
    defaultBranch: String!
    projects: [Project!]!
    sessions: [Session!]!
  }

  input CreateRepoInput {
    organizationId: ID!
    name: String!
    remoteUrl: String!
    defaultBranch: String
  }
`;

const projectTypeDefs = `#graphql
  type Project {
    id: ID!
    name: String!
    repo: Repo
    channels: [Channel!]!
    sessions: [Session!]!
    tickets: [Ticket!]!
  }

  input CreateProjectInput {
    organizationId: ID!
    name: String!
    repoId: ID
  }
`;

const channelTypeDefs = `#graphql
  type Channel {
    id: ID!
    name: String!
    type: ChannelType!
    members: [User!]!
    projects: [Project!]!
    messages(after: DateTime, limit: Int): [Event!]!
  }

  input CreateChannelInput {
    organizationId: ID!
    name: String!
    type: ChannelType
    projectIds: [ID!]
  }
`;

const sessionTypeDefs = `#graphql
  type Session {
    id: ID!
    name: String!
    status: SessionStatus!
    tool: CodingTool!
    hosting: HostingMode!
    createdBy: User!
    repo: Repo
    branch: String
    channel: Channel
    projects: [Project!]!
    tickets: [Ticket!]!
    endpoints: SessionEndpoints
    connection: SessionConnection
  }

  input StartSessionInput {
    tool: CodingTool!
    hosting: HostingMode!
    repoId: ID
    branch: String
    ticketId: ID
    channelId: ID
    projectId: ID
    prompt: String
  }

  input SessionFilters {
    status: SessionStatus
    tool: CodingTool
    repoId: ID
  }
`;

const ticketTypeDefs = `#graphql
  type Ticket {
    id: ID!
    title: String!
    description: String!
    status: TicketStatus!
    priority: Priority!
    assignees: [User!]!
    labels: [String!]!
    origin: Event
    channel: Channel
    projects: [Project!]!
    sessions: [Session!]!
  }

  input CreateTicketInput {
    organizationId: ID!
    title: String!
    description: String
    priority: Priority
    labels: [String!]
    channelId: ID
    projectId: ID
  }

  input UpdateTicketInput {
    title: String
    description: String
    status: TicketStatus
    priority: Priority
    labels: [String!]
  }

  input TicketFilters {
    status: TicketStatus
    priority: Priority
    channelId: ID
  }
`;

const eventTypeDefs = `#graphql
  type Event {
    id: ID!
    scopeType: ScopeType!
    scopeId: ID!
    eventType: String!
    payload: JSON!
    actor: Actor!
    parentId: ID
    timestamp: DateTime!
    metadata: JSON
  }

  input ScopeInput {
    type: ScopeType!
    id: ID!
  }
`;

const queryTypeDefs = `#graphql
  type Query {
    organization(id: ID!): Organization
    repos(organizationId: ID!): [Repo!]!
    repo(id: ID!): Repo
    projects(organizationId: ID!, repoId: ID): [Project!]!
    project(id: ID!): Project
    channels(organizationId: ID!, projectId: ID): [Channel!]!
    channel(id: ID!): Channel
    sessions(organizationId: ID!, filters: SessionFilters): [Session!]!
    session(id: ID!): Session
    mySessions(organizationId: ID!, status: SessionStatus): [Session!]!
    tickets(organizationId: ID!, filters: TicketFilters): [Ticket!]!
    ticket(id: ID!): Ticket
    events(organizationId: ID!, scope: ScopeInput, types: [String!], after: DateTime, limit: Int): [Event!]!
  }
`;

const mutationTypeDefs = `#graphql
  type Mutation {
    createChannel(input: CreateChannelInput!): Channel!
    sendMessage(channelId: ID!, text: String!, parentId: ID): Event!
    startSession(input: StartSessionInput!): Session!
    pauseSession(id: ID!): Session!
    resumeSession(id: ID!): Session!
    terminateSession(id: ID!): Session!
    sendSessionMessage(sessionId: ID!, text: String!): Event!
    createTicket(input: CreateTicketInput!): Ticket!
    updateTicket(id: ID!, input: UpdateTicketInput!): Ticket!
    commentOnTicket(ticketId: ID!, text: String!): Event!
    linkSessionToTicket(sessionId: ID!, ticketId: ID!): Session!
    linkEntityToProject(entityType: EntityType!, entityId: ID!, projectId: ID!): Project!
    createRepo(input: CreateRepoInput!): Repo!
    createProject(input: CreateProjectInput!): Project!
  }
`;

const subscriptionTypeDefs = `#graphql
  type Subscription {
    channelEvents(channelId: ID!, types: [String!]): Event!
    sessionEvents(sessionId: ID!): Event!
    ticketEvents(ticketId: ID!): Event!
    userNotifications(organizationId: ID!): Notification!
    sessionPortsChanged(sessionId: ID!): SessionEndpoints!
    sessionStatusChanged(sessionId: ID!): Session!
  }
`;

export const typeDefs = [
  baseTypeDefs,
  organizationTypeDefs,
  userTypeDefs,
  repoTypeDefs,
  projectTypeDefs,
  channelTypeDefs,
  sessionTypeDefs,
  ticketTypeDefs,
  eventTypeDefs,
  queryTypeDefs,
  mutationTypeDefs,
  subscriptionTypeDefs,
];
