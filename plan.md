# Trace — Product Document v0.1

**The Unified Platform for AI-Native Teams**
*First Draft — March 2026 — CONFIDENTIAL*

---

## 1. Executive Summary

Trace is a unified, AI-native platform that collapses the boundaries between project management, team communication, and AI-assisted software development into a single product.

Today, engineering teams operate across a fragmented stack — Slack for communication, Linear or Jira for project tracking, and a growing set of AI coding assistants (Claude Code, Cursor, Windsurf, etc.). Context is lost at every boundary. Decisions made in chat never become tickets. Tickets reference code that lives somewhere else. AI assistants operate in isolation, disconnected from the team's broader context.

Trace eliminates this fragmentation. The platform is built on a single, event-driven data model where every action — a message sent, a ticket created, a line of code written, an AI response generated — is a first-class event visible to both humans and agents. An always-on ambient agent observes the full event stream and acts as a proactive team member: surfacing insights, creating tickets from conversations, responding to comments, performing research, and orchestrating coding sessions.

The platform is mobile-first and multiplayer from day one. Every organization supports real-time collaboration, and every capability available to a human user is equally accessible to an AI agent through the same underlying service layer.

> **Core Thesis:** The distinction between chat, project management, and AI coding is artificial. These are all just events in a shared space. Unify the event model, give agents first-class citizenship, and the entire workflow collapses into something fundamentally simpler and more powerful.

---

## 2. Vision & Design Principles

### 2.1 Everything Is an Event

The entire platform is built on a single, append-only event log. Every meaningful action — a user sending a message, an agent creating a ticket, a coding tool executing a command, a file being modified — produces an event. Events are the atomic unit of the platform. They are immutable, ordered, and universally visible within their scope.

This is not just a storage decision; it is the product's core abstraction. The UI, the API, the agent system, and the real-time sync layer all operate on the same event stream.

### 2.2 Agents Are First-Class Citizens

There is no separate "agent mode" or "automation layer." Agents operate through the exact same service layer as human users. An agent can send a message, create a ticket, comment on a ticket, start a coding session, react to a message, or modify any entity in the system.

The permissions model, the event schema, and the service layer treat human and agent actors identically. The only distinction is the `actor_type` field on each event. This means that any new capability built for users is automatically available to agents, and vice versa.

### 2.3 Tickets as Derived State

Traditional project management tools treat tickets as primary, manually-created artifacts. In Trace, tickets are derived state. They can be created manually, but more commonly they emerge from conversations, code changes, agent observations, or any other event in the system. A ticket is simply a structured projection of the underlying event stream, enriched with metadata.

This means tickets are always contextually linked to the events that spawned them — the conversation where a bug was first reported, the coding session where a regression was introduced, or the agent analysis that identified a gap.

### 2.4 Pluggable Systems, Not Hardcoded Integrations

Trace abstracts every external system behind a well-defined adapter interface. The coding layer doesn't know it's talking to Claude Code — it talks to a session adapter. The agent layer doesn't know it's powered by Claude — it talks to a model adapter. Git operations go through a source control adapter. Notifications go through a delivery adapter. This means swapping out any underlying system — switching coding assistants, changing LLM providers, moving from GitHub to GitLab — is a configuration change, not a rewrite. No core system in Trace has a hard dependency on a specific vendor or tool.

### 2.5 Mobile & Multiplayer from Day One

This is not a desktop tool with a mobile companion app. The architecture assumes multiple concurrent users on multiple device form factors from the ground up. Real-time sync, conflict resolution, and responsive layouts are foundational — not afterthoughts.

---

## 3. Core Data Model

All entities in Trace are scoped to an organization and live at the same level. Nothing nests inside anything else. Channels, sessions, tickets, repos, and projects are all peers — the relationships between them are links, not containment. This flat structure makes the data model easy to extend (adding teams, milestones, sprints, etc. later is just another entity with links) and avoids the rigidity of deep hierarchies.

```
Organization
  ├── Users
  ├── Repos              (codebases — discovered from local folders)
  ├── Projects           (grouping — ties related work together)
  ├── Channels           (communication — like Slack)
  ├── Sessions           (coding work — like Claude Code)
  └── Tickets            (tracking — like Linear)
```

### 3.1 The Event

The event is the universal primitive. Every single thing that happens in Trace produces one or more events.

```
Event {
  id:                UUID
  organization_id:   UUID
  scope_type:        "channel" | "session" | "ticket" | "system"
  scope_id:          UUID
  actor_type:        "user" | "agent" | "system"
  actor_id:          UUID
  event_type:        string          // e.g. "message.sent", "tool.invoked", "ticket.created"
  payload:           JSON            // type-specific structured data
  parent_id:         UUID | null     // for threading / nesting
  timestamp:         ISO 8601
  metadata:          JSON            // tags, client info, trace IDs, etc.
}
```

Event types span across all domains:

- **Communication:** `message.sent`, `message.edited`, `reaction.added`, `thread.created`
- **Project Management:** `ticket.created`, `ticket.status_changed`, `ticket.assigned`, `comment.added`, `label.applied`
- **Coding Sessions:** `tool.invoked`, `tool.result`, `file.created`, `file.modified`, `command.executed`, `ai.response`
- **Agent Actions:** `agent.observation`, `agent.suggestion`, `agent.action_taken`, `agent.escalation`
- **System:** `member.joined`, `permission.changed`, `webhook.received`, `integration.synced`

### 3.2 Organization

The organization is the top-level scope. Every single entity in the database has an `organization_id`. There is no entity that exists outside of an organization.

```
Organization {
  id:           UUID
  name:         string
  members:      User[]
  settings:     OrgSettings
}
```

### 3.3 Repo

Repos are first-class entities representing codebases. They are not pulled from GitHub or GitLab automatically — they are discovered from local folders. A user points the Trace CLI at a local directory, the bridge reads the git remote URL, and creates the Repo entity in the organization.

```
Repo {
  id:                UUID
  organization_id:   UUID
  name:              string          // "api-server", "web-app", "mobile"
  remote_url:        string          // from `git remote get-url origin`
  default_branch:    string          // from `git symbolic-ref HEAD`
  setup_config:      SetupConfig     // the .trace/config.yml contents (for cloud sessions)
}
```

**Discovery flow.** A user runs `trace repo add /path/to/my/project`. The bridge reads the folder, extracts the remote URL via `git remote get-url origin`, and sends it to Trace's API. If a Repo with that remote URL already exists in the org, the bridge links to it. If not, it creates a new one. The local path mapping is stored only in the user's local config (`~/.trace/config.yml`) — different team members can have the same repo at different paths on their machines and they all map to the same Repo entity via the remote URL.

```yaml
# ~/.trace/config.yml (local, per-user, not synced)
repos:
  - path: /Users/alice/projects/api-server
  - path: /Users/alice/work/web-app
```

For cloud sessions, the `remote_url` on the Repo entity is what the Fly Machine uses to clone. For local sessions, the bridge looks up the local path from its config for that repo.

### 3.4 Project

Projects are lightweight grouping containers that tie related work together. A project might map to an initiative ("Backend API Rewrite"), a milestone ("Q2 Launch"), or simply a repo. Projects don't own anything — they link to channels, sessions, tickets, and repos.

```
Project {
  id:                UUID
  organization_id:   UUID
  name:              string
  repo_id:           UUID | null     // optional default repo for sessions
}
```

A channel, session, or ticket can belong to zero or more projects. Things can exist outside of any project — a general #watercooler channel doesn't need a project. The project serves as the primary navigation surface for organized work: "show me everything related to the API Rewrite."

### 3.5 Channel

Channels are persistent, topic-scoped communication spaces — analogous to Slack channels, but natively integrated with every other entity type.

```
Channel {
  id:                UUID
  organization_id:   UUID
  name:              string
  type:              "default" | "announcement" | "triage" | "feed"
  members:           User[]
  project_ids:       UUID[]          // which projects this channel belongs to
}
```

Channels carry a live event stream of messages, agent actions, and lightweight notifications from linked sessions and tickets. When a session is started from a channel, or a ticket is created from a channel conversation, the channel gets a lightweight notification event — not the full event stream of the linked entity. The channel stays a communication space. Users click through to the session or ticket to see the full detail.

### 3.6 Session (Coding Tool Instance)

A session is a single instance of an AI coding tool. It is the unit of "AI work" — comparable to a Claude Code session, a Cursor workspace, or a Devin task. Sessions are top-level entities that can optionally link to channels, tickets, projects, and repos.

```
Session {
  id:                UUID
  organization_id:   UUID
  name:              string
  status:            "active" | "paused" | "completed" | "failed" | "unreachable"
  tool:              "claude-code" | "cursor" | "custom" | ...
  hosting:           "cloud" | "local"
  created_by:        UUID            // user who started it
  repo_id:           UUID | null     // which repo this operates on
  branch:            string | null   // which branch
  channel_id:        UUID | null     // channel it was started from (optional)
  project_ids:       UUID[]          // which projects this belongs to
  ticket_ids:        UUID[]          // linked tickets

  // Cloud session endpoints (populated when hosting: "cloud")
  endpoints: {
    terminals: [
      { id: string, ws_url: string, status: "active" | "closed" }
    ]
    ports: [
      { port: number, url: string, label: string, status: "listening" | "closed" }
    ]
  }

  // Connection info (for local sessions)
  connection: {
    last_seen:         timestamp     // last event received from bridge
    bridge_version:    string
  }
}
```

Sessions support two hosting modes. **Cloud sessions** run in Fly Machines containers provisioned and managed by Trace — including shell access, port forwarding, and the full dev environment (see Section 8.3). **Local sessions** run on a developer's own machine, with a lightweight bridge process pushing events up to Trace's API. Both modes produce identical event streams; the rest of the platform doesn't know the difference.

The `unreachable` status is specific to local sessions — it means events have stopped arriving but the session wasn't explicitly terminated. The UI shows this distinctly from "paused" or "failed."

**Session creation.** Starting a session requires a tool and a hosting mode. Everything else is optional. When started from a ticket or project, the repo and links are pre-filled from context. When started standalone, the user picks a repo (Trace shows recent repos at the top, searchable list below) or starts with no repo at all for exploratory work. The agent may later suggest linking an unlinked session to a ticket.

```graphql
mutation {
  startSession(input: {
    tool: CLAUDE_CODE
    hosting: CLOUD
    repoId: "repo_abc"           # optional
    branch: "main"               # optional, defaults to repo default
    ticketId: "ticket_xyz"       # optional, auto-links
    channelId: "channel_123"     # optional, posts notification
    projectId: "project_456"     # optional, auto-links
    prompt: "Fix the Safari..."  # optional initial prompt
  }) {
    id
    name
    status
    endpoints { ports { port url label } }
  }
}
```

**Local sessions and worktrees.** For local sessions, the user already has the repo cloned. To support concurrent sessions on the same repo without file conflicts, the bridge uses git worktrees. Each session gets an isolated working directory branching off from the specified branch:

```
trace start --path /Users/alice/projects/api-server --tool claude-code
  → Bridge looks up Repo entity by remote URL
  → Bridge creates a branch: trace/session_{id}
  → Bridge creates worktree: git worktree add ~/.trace/worktrees/{session_id} trace/session_{id}
  → Coding tool starts with working directory set to the worktree
  → On session complete: changes committed/pushed, worktree cleaned up
```

The user's main checkout stays untouched. Multiple sessions on the same repo each get their own worktree and branch.

### 3.7 Ticket

Tickets are structured work items — bugs, features, tasks, epics. Unlike traditional tools, tickets in Trace are often *created by agents* or *derived from events* rather than manually authored.

```
Ticket {
  id:                UUID
  organization_id:   UUID
  title:             string
  description:       string
  status:            "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled"
  priority:          "urgent" | "high" | "medium" | "low"
  assignees:         User[]          // can be users or agents
  labels:            string[]
  origin:            EventReference  // the event that spawned this ticket
  channel_id:        UUID | null     // channel where it originated
  project_ids:       UUID[]          // which projects this belongs to
  session_ids:       UUID[]          // linked sessions
}
```

Tickets and sessions are independent entities with an optional many-to-many relationship. A session can exist without a ticket (exploratory work, prototyping). A ticket can exist without a session (documentation tasks, design reviews). A ticket can link to multiple sessions (multiple attempts at a fix). A session can link to multiple tickets (one session resolves several issues). Neither forces the other to exist.

Key properties of tickets in Trace:

- **Origin tracking.** Every ticket knows exactly where it came from — a message, a code change, an agent observation, or manual creation.
- **Bidirectional linking.** Tickets link to sessions, channels, and other tickets. Following any link takes you to the full event context.
- **Agent-assignable.** An agent can be assigned to a ticket and autonomously work on it — starting coding sessions, posting updates, requesting review.
- **Comment stream.** Comments on tickets are events scoped to the ticket, which means the ambient agent sees them and can respond.

### 3.8 Navigation Model

The flat entity structure supports three natural navigation paths:

**By channel** — "What's the team talking about?" Open #backend, see messages and conversation. Lightweight cards for sessions and tickets that were started or created from this channel appear inline, but the granular session events and ticket comment threads stay in their own views.

**By project** — "What's happening on the API Rewrite?" Open the project and see all related channels, sessions (filterable by status, assignee, tool), and tickets in one organized view. This is where 200 sessions across 20 people becomes manageable — filter by your own sessions, active sessions, sessions linked to a specific ticket, etc.

**By entity directly** — "Show me my sessions" or "Show me all open tickets." Top-level list views that cut across projects and channels. A sessions list with filters for: mine, active, by project, by repo, by tool, by linked ticket. A tickets board with filters for: mine, by project, by status, by priority.

---

## 4. The Ambient Agent

The ambient agent is the connective tissue of the platform. It is an always-on AI system that observes the full event stream of an organization and takes intelligent action.

### 4.1 What the Agent Does

The ambient agent is not a chatbot you invoke. It is a background process that continuously monitors all events and intervenes when it has something valuable to contribute. Its behaviors include:

**Ticket Creation from Conversations.** When users discuss a bug, feature request, or task in a channel, the agent detects this and proposes creating a ticket — pre-populated with title, description, labels, and priority inferred from the conversation context.

**Comment Response.** When a user leaves a comment on a ticket, the agent reads the comment in context (the ticket, linked sessions, related conversations) and may reply — answering a question, providing relevant code context, or flagging a concern.

**Research.** When a new topic or technology is mentioned, the agent can proactively perform research — searching documentation, analyzing codebases, or querying external sources — and surface findings in the relevant channel or ticket.

**Coding Session Orchestration.** The agent can start, monitor, and manage coding sessions. If a ticket is assigned to the agent, it can autonomously initiate a session, write code, run tests, and post results back to the ticket.

**Triage & Routing.** The agent can triage incoming tickets, suggest priorities, assign to appropriate team members, and flag duplicates or dependencies.

**Cross-Entity Linking.** The agent identifies connections between disparate events — linking a channel conversation about performance to an existing ticket about the same issue, or connecting a coding session's output to the ticket it was working on.

**Proactive Suggestions.** The agent might read a user's message to another user and ask if they want to create a ticket based on something said, suggest that a session be started for a discussed problem, or flag that a related ticket already exists.

### 4.2 Agent Interaction Model

The agent operates on a **first-pass principle**: it gets a first look at every event before it reaches the user's attention in a meaningful way. This doesn't mean the agent blocks or delays events — events flow in real time — but the agent processes the event stream with low latency and can inject its own events (suggestions, actions, observations) into the stream immediately after.

Users interact with the agent in several modes:

- **Passive observation.** The agent works silently, creating tickets, linking entities, and enriching metadata without requiring user attention.
- **Suggestions.** The agent surfaces proposals (e.g., "Create a ticket for this?") that the user can accept, modify, or dismiss with a single tap.
- **Direct interaction.** Users can @mention the agent in any channel or ticket comment to ask it to do something specific.
- **Autonomous execution.** For tasks assigned to the agent (e.g., a ticket), it works independently, posting progress updates and requesting human input only when needed.

### 4.3 Agent Service Access

The agent lives on the server. It does not call GraphQL mutations — GraphQL is an external interface for clients (web, mobile, Electron). The agent calls the service layer directly, the same service layer that GraphQL resolvers call. This is the correct architecture because the agent is a server-side process; having it serialize a GraphQL query, send it to itself, parse the response, and resolve it back into the same service calls it could have made directly would be pointless overhead.

The principle isn't "agents use GraphQL." It's "agents have the same capabilities and permissions as users." That's enforced at the service layer.

```
GraphQL resolvers  →  Service Layer  ←  Agent Runtime
                          ↓
                     Event Store
```

```typescript
// GraphQL resolver — thin wrapper, called by external clients
const resolvers = {
  Mutation: {
    createTicket: (_, { input }, ctx) => {
      return ticketService.create({
        ...input,
        actorType: ctx.actorType,  // "user" — from auth context
        actorId: ctx.userId,
      })
    }
  }
}

// Agent runtime — calls the same service directly
async function handleBugReport(event: Event) {
  await ticketService.create({
    organizationId: event.organizationId,
    title: "Fix memory leak in websocket handler",
    description: "Identified from discussion in #backend...",
    priority: "high",
    labels: ["bug", "performance"],
    originEventId: event.id,
    channelId: event.scopeId,
    actorType: "agent",            // agent identity
    actorId: "agent_ambient_001",
  })
}
```

Both paths hit `ticketService.create()`, which validates the input, checks permissions, creates the ticket, appends the event to the event store, and broadcasts it. The service doesn't know or care whether it was called from a GraphQL resolver or from the agent runtime.

This design means:

- The service layer is the single source of truth for business logic, validation, and authorization
- GraphQL resolvers are thin — parse input, call a service, format output
- Every new service method is automatically available to the agent
- Agent behavior is fully auditable through the event log (same events, same store)
- Permissions and access controls work identically — the `actorType` and `actorId` are just parameters

---

## 5. API Design

### 5.1 Design Philosophy

The service layer is the product. Every feature in Trace — the web UI, the mobile app, the Electron bridge, the ambient agent, third-party integrations — is built on top of the same service layer. GraphQL is the external interface that clients use to access it. The agent runtime, which lives on the server, calls the service layer directly.

```
Web / Mobile / Electron  →  GraphQL  →  Service Layer  ←  Agent Runtime
                                             ↓
                                        Event Store
```

Trace uses **GraphQL** for the external data API (queries, mutations, subscriptions) and **plain WebSockets** for infrastructure-level protocols (session bridge, terminal streaming). GraphQL is the right tool for external clients because Trace's data model is heavily relational — every view in the app cross-cuts multiple entity types — and the mobile-first requirement demands precise control over payload size. The bridge protocol and terminal streaming are not data APIs and don't belong in GraphQL.

Core principles:

- **Actions in, events out.** Clients call mutations to perform actions. The service layer validates, authorizes, executes, and produces the corresponding event as a side effect. Events flow back to clients through subscriptions. No client ever creates events directly. The agent runtime calls the same service layer directly, bypassing GraphQL.
- **Actor-agnostic.** The service layer does not distinguish between human and agent callers. The `actor_type` is metadata passed into each service call, not a routing decision.
- **Real-time first.** GraphQL subscriptions power the event stream for external clients. The agent subscribes to the event stream directly via the real-time broker.
- **Composable.** Types are independently queryable and linkable through field resolvers. No deep nesting or required sequential workflows.

### 5.2 Event Generation Model

Events are always generated by the service layer. No client — frontend, agent, or bridge — ever creates an event directly. This is a firm architectural constraint.

```
User action:
  Frontend calls mutation: sendMessage(channelId: "ch_123", text: "hey team")
    → GraphQL resolver calls messageService.send({ channelId, text, actorType: "user", actorId })
    → Service validates, creates event, appends to event store, broadcasts
    → Frontend receives the event back through its subscription

Agent action:
  Agent runtime calls messageService.send({ channelId, text, actorType: "agent", actorId })
    → Same service, same validation, same event creation, same broadcast
    → All frontends receive the event through their subscriptions
```

This guarantees that every event has a valid ID, a trustworthy timestamp, and has passed through authorization — regardless of whether the action came from a GraphQL mutation or the agent runtime. The GraphQL schema has a clean separation: **mutations are the action layer** (things users *do* via the UI), **subscriptions are the event layer** (things that *happened*), and **queries are the hydration layer** (current state of entities). The agent bypasses the first layer and calls services directly, but the events it produces flow through the same event and hydration layers.

### 5.3 Schema Domains

The GraphQL schema is organized by domain, with each domain owning its types, queries, mutations, and subscriptions. The structure follows a one-resolver-per-file convention with codegen-driven scaffolding:

```
src/schema/
├── base/                    # scalars (DateTime, JSON)
├── organization/            # org CRUD, members, settings
├── repo/                    # repo entities, discovery
├── project/                 # project CRUD, linking
├── channel/                 # channels, messages
├── session/                 # session CRUD, control, events
├── ticket/                  # tickets, comments, board queries
├── agent/                   # agent config, trust levels, suggestions
├── event/                   # universal event queries, subscriptions
└── auth/                    # authentication, permissions
```

### 5.4 Schema Overview

**Core types** (each resolved with cross-entity links via field resolvers):

```graphql
type Organization {
  id: ID!
  name: String!
  members: [User!]!
  repos: [Repo!]!
  projects: [Project!]!
  channels: [Channel!]!
}

type Repo {
  id: ID!
  name: String!
  remoteUrl: String!
  defaultBranch: String!
  projects: [Project!]!
  sessions: [Session!]!
}

type Project {
  id: ID!
  name: String!
  repo: Repo
  channels: [Channel!]!
  sessions: [Session!]!
  tickets: [Ticket!]!
}

type Channel {
  id: ID!
  name: String!
  type: ChannelType!
  members: [User!]!
  projects: [Project!]!
  messages(after: DateTime, limit: Int): [Event!]!
}

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
```

**Queries** (hydration layer — fetch current state):

```graphql
type Query {
  # Organization
  organization(id: ID!): Organization

  # Repos
  repos(organizationId: ID!): [Repo!]!
  repo(id: ID!): Repo

  # Projects
  projects(organizationId: ID!, repoId: ID): [Project!]!
  project(id: ID!): Project

  # Channels
  channels(organizationId: ID!, projectId: ID): [Channel!]!
  channel(id: ID!): Channel

  # Sessions
  sessions(organizationId: ID!, filters: SessionFilters): [Session!]!
  session(id: ID!): Session
  mySessions(organizationId: ID!, status: SessionStatus): [Session!]!

  # Tickets
  tickets(organizationId: ID!, filters: TicketFilters): [Ticket!]!
  ticket(id: ID!): Ticket

  # Events
  events(organizationId: ID!, scope: ScopeInput, types: [String!], after: DateTime, limit: Int): [Event!]!
}
```

**Mutations** (action layer — things users and agents do):

```graphql
type Mutation {
  # Channels
  createChannel(input: CreateChannelInput!): Channel!
  sendMessage(channelId: ID!, text: String!, parentId: ID): Event!

  # Sessions
  startSession(input: StartSessionInput!): Session!
  pauseSession(id: ID!): Session!
  resumeSession(id: ID!): Session!
  terminateSession(id: ID!): Session!
  sendSessionMessage(sessionId: ID!, text: String!): Event!

  # Tickets
  createTicket(input: CreateTicketInput!): Ticket!
  updateTicket(id: ID!, input: UpdateTicketInput!): Ticket!
  commentOnTicket(ticketId: ID!, text: String!): Event!

  # Linking
  linkSessionToTicket(sessionId: ID!, ticketId: ID!): Session!
  linkEntityToProject(entityType: EntityType!, entityId: ID!, projectId: ID!): Project!

  # Repos & Projects
  createRepo(input: CreateRepoInput!): Repo!
  createProject(input: CreateProjectInput!): Project!
}

input StartSessionInput {
  tool: CodingTool!
  hosting: HostingMode!
  repoId: ID              # optional
  branch: String           # optional, defaults to repo default
  ticketId: ID             # optional, auto-links
  channelId: ID            # optional, posts notification
  projectId: ID            # optional, auto-links
  prompt: String           # optional initial prompt
}
```

**Subscriptions** (event layer — things that happened):

```graphql
type Subscription {
  # Scoped event streams
  channelEvents(channelId: ID!, types: [String!]): Event!
  sessionEvents(sessionId: ID!): Event!
  ticketEvents(ticketId: ID!): Event!

  # Ambient tier (always-on, lightweight)
  userNotifications(organizationId: ID!): Notification!

  # Session-specific
  sessionPortsChanged(sessionId: ID!): SessionEndpoints!
  sessionStatusChanged(sessionId: ID!): Session!
}
```

### 5.5 Plain WebSocket Protocols

Two concerns live outside GraphQL as plain WebSocket connections. These are infrastructure-level protocols, not data APIs.

**Session bridge** — The bidirectional control channel between Trace and the session host (Fly container or Electron app). Carries inbound commands (messages, pause, terminate) and outbound events (tool output, file changes). See Section 8.2 for details.

```
WS /bridge/sessions/{id}
```

**Terminal streaming** — Interactive PTY connections to cloud session shells. Raw bidirectional byte streams that don't fit into GraphQL's request/response or subscription model.

```
WS /terminals/{sessionId}/{terminalId}/stream
```

### 5.6 Real-Time Protocol

External clients (web, mobile, Electron) receive real-time updates through GraphQL subscriptions. The agent runtime subscribes to the event stream directly on the server via the real-time broker — it doesn't go through GraphQL. The subscription layer supports:

- **Scope filtering.** Subscribe to events from a specific channel, session, or ticket.
- **Type filtering.** Subscribe only to certain event types (e.g., only `message.sent` events in a channel).
- **Ambient notifications.** The `userNotifications` subscription provides a lightweight always-on stream for badges, @mentions, agent suggestions, and ticket assignments — regardless of which view the user is currently on.
- **Presence.** Built-in presence indicators for all organization members (including agents).
- **Typing indicators.** Treated as ephemeral events, not persisted.

---

## 6. Product Surfaces

### 6.1 Channels (The Slack Layer)

Channels are the primary communication surface. They look and feel like Slack channels, but with deep integration into every other entity type.

**Key differences from Slack:**

- Messages can be promoted to tickets with one tap. The agent may suggest this automatically.
- Coding sessions can be started from a channel. The channel gets a lightweight notification ("Alice started a session: Fix date range filter") — not the full session event stream. Click through to observe the session.
- Tickets linked to a channel surface inline as lightweight cards — status changes and completions appear as channel events, but the full comment thread stays in the ticket view.
- The ambient agent participates as a channel member, responding to messages, creating tickets, and surfacing relevant context.

### 6.2 Board (The Linear Layer)

The board is the project management surface — a kanban-style view of tickets with filtering, grouping, and sorting.

**Key differences from Linear:**

- Tickets have full provenance. Every ticket links back to the conversation, session, or event that created it.
- The board is a *view* over the event stream, not a separate data store. Filtering the board is equivalent to filtering events with `scope_type: ticket`.
- The board can be scoped to a project, showing only tickets belonging to that project, or viewed across the entire organization.
- Agents can be assigned to tickets, and their progress is visible on the board like any other assignee.
- Ticket comments flow into the event stream, so the ambient agent can respond to them in context.
- Cycle/sprint planning is informed by agent analysis of velocity, session output, and conversation sentiment.

### 6.3 Sessions (The Coding Layer)

The sessions surface is where AI-assisted development happens. It is comparable to running a Claude Code or Cursor session, but with full multiplayer and organization-wide integration.

**Key properties:**

- **Observable.** Every event in a session — user messages, AI responses, tool invocations, file changes — is visible to all organization members in real time.
- **Multiplayer.** Multiple users can observe or interact with the same session simultaneously.
- **Linked.** Sessions can optionally link to tickets, channels, projects, and repos. Starting a session from a ticket automatically provides the AI with the ticket's context. Starting standalone is equally valid.
- **Replayable.** The full event log of a session is preserved and can be replayed, analyzed, or audited.
- **Tool-agnostic.** The session model is an abstraction layer. Under the hood, sessions can be backed by different coding tools — Claude Code, custom agents, or future tools — through a standard adapter interface.
- **Full dev environment (cloud sessions).** Cloud sessions aren't just an AI running in a box. They include interactive shell access, automatic port forwarding with shareable preview URLs, and the complete repo environment with user-defined setup scripts. Users can open a terminal, run tests, start dev servers, and access the running app in their browser — all from within Trace.

### 6.4 Mobile Experience

Mobile is not a reduced version of the desktop app. It is a purpose-built interface optimized for the actions users most commonly take on mobile:

- Reading and responding to channel messages
- Reviewing and triaging tickets
- Accepting or dismissing agent suggestions
- Observing active coding sessions (read-only stream view)
- Approving or blocking agent-proposed actions
- Quick ticket creation from voice or text

The mobile client connects to the same GraphQL API and subscription layer as the web and Electron clients.

---

## 7. Workflows

### 7.1 Workflow: Bug Reported in Chat → Ticket → Session → Resolution

1. A user posts in #frontend: *"The dashboard is crashing when you filter by date range on Safari."*
2. The ambient agent detects this as a bug report and suggests creating a ticket — pre-filled with title, description, priority, and labels.
3. The user accepts with one tap. The ticket is created with `origin` pointing to the original message, linked to #frontend.
4. The agent, assigned to triage, sets priority to high and assigns it to a frontend developer.
5. The developer opens the ticket on mobile, reads the context, and starts a cloud session linked to the ticket. The repo and branch are pre-filled from the ticket's project.
6. The session's AI assistant has full context: the original message, the ticket description, and the codebase. It begins investigating.
7. #frontend gets a lightweight notification that a session was started. The ticket view shows full session progress. Organization members can click through to observe the session in real time.
8. The developer reviews the fix in the session's terminal, approves, and merges. The ticket auto-transitions to "done."

### 7.2 Workflow: Agent-Driven Research & Ticket Enrichment

1. A new ticket is created: *"Evaluate switching from REST to gRPC for the session protocol."*
2. The ambient agent picks up the ticket, recognizes it as a research task, and begins autonomous research.
3. The agent searches documentation, analyzes the current codebase, reviews benchmarks, and reads relevant discussions in channels.
4. The agent posts a structured research summary as a ticket comment with findings, tradeoffs, and a recommendation.
5. A user reads the comment, replies with a follow-up question. The agent responds in context.
6. The ticket is enriched with linked resources, and the agent suggests creating sub-tickets for the implementation plan.

### 7.3 Workflow: Cross-Entity Linking

1. In #backend, a user mentions: *"The webhook retry logic is broken again."*
2. The ambient agent searches existing tickets and finds TRACE-142: *"Webhook retries not respecting backoff policy"* from two weeks ago.
3. The agent posts in the channel: *"This might be related to TRACE-142 — should I reopen it?"*
4. The user confirms, and the agent reopens the ticket, adds the new conversation as context, and bumps the priority.

---

## 8. Architecture Overview

### 8.1 Core Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     External Clients                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │  Web App  │  │ Mobile   │  │ Electron │                    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                    │
│       │              │             │                          │
│       └──────────────┼─────────────┘                          │
│                      │                                        │
│              ┌───────▼────────┐                               │
│              │    GraphQL      │                              │
│              │  (queries,      │                              │
│              │   mutations,    │                              │
│              │   subscriptions)│                              │
│              └───────┬────────┘                               │
│                      │                                        │
│              ┌───────▼────────┐      ┌───────────────────┐    │
│              │                │      │   Agent Runtime    │    │
│              │  Service Layer │◄─────┤  (subscribes to   │    │
│              │  (business     │      │   event stream,    │    │
│              │   logic,       │      │   calls services   │    │
│              │   validation,  │      │   directly)        │    │
│              │   auth)        │      └───────────────────┘    │
│              └───────┬────────┘                               │
│                      │                                        │
│    ┌─────────────────┼─────────────────────┐                  │
│    │                 │                     │                  │
│  ┌─▼──────┐  ┌──────▼───────┐  ┌──────────▼──────────┐       │
│  │ Event   │  │   Entity     │  │    Real-Time        │       │
│  │ Store   │  │   Service    │  │    Broker           │       │
│  │(append) │  │  (derived)   │  │   (fanout)          │       │
│  └─┬──────┘  └──────┬───────┘  └─────────────────────┘       │
│    │                │                                         │
│    └───────┬────────┘                                         │
│            │                                                  │
│    ┌───────▼───────┐          ┌────────────────────────┐      │
│    │   Event Log    │         │  Session Router         │     │
│    │  (source of    │         │  (Fly API or bridge     │     │
│    │   truth)       │         │   dispatch)             │     │
│    └───────────────┘          └────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘

         ┌──────────────────────────────────────┐
         │        Fly Machines (Cloud Sessions)  │
         │  ┌────────┐  ┌────────┐  ┌────────┐  │
         │  │ Session │  │ Session │  │ Session │  │
         │  │   #1    │  │   #2    │  │   #3    │  │
         │  │ bridge  │  │ bridge  │  │ bridge  │  │
         │  │ ttyd    │  │ ttyd    │  │ ttyd    │  │
         │  │ ports   │  │ ports   │  │ ports   │  │
         │  └────────┘  └────────┘  └────────┘  │
         └──────────────────────────────────────┘
```

**Event Store** — Append-only log of all events. This is the source of truth. All state is derivable from this log.

**Entity Service** — Materializes derived state (tickets, channels, sessions, member profiles) from the event log. Provides efficient read queries over the current state of entities.

**Real-Time Broker** — Fans out events to subscribers. External clients receive events through GraphQL subscriptions. The agent runtime subscribes directly via the broker. Handles scope and type filtering, presence, and ephemeral events. Clients subscribe only to their active viewport (see Section 8.6).

**Service Layer** — The single source of truth for business logic, validation, and authorization. Both GraphQL resolvers and the agent runtime call the service layer. It produces events, appends them to the event store, and triggers the real-time broker. GraphQL resolvers are thin wrappers around service calls.

**Session Router** — The single place on the server that knows about hosting modes. Takes inbound session commands, checks whether the session is cloud or local, and dispatches to the right place — either the Fly Machines API or the bridge WebSocket to the Electron app.

### 8.2 Session Adapter Layer

The session adapter is the core abstraction that makes cloud and local sessions interchangeable. It defines a contract that both hosting modes implement. The rest of the platform — the API, the agent, the frontend — interacts with sessions exclusively through this interface. It never knows whether the session is running in a Fly Machine or on someone's laptop.

**The adapter interface:**

```typescript
interface SessionAdapter {
  start(config: SessionConfig): Promise<SessionHandle>
  send(sessionId: string, event: SessionEvent): Promise<void>
  pause(sessionId: string): Promise<void>
  resume(sessionId: string): Promise<void>
  terminate(sessionId: string): Promise<void>
  onEvent(sessionId: string, callback: (event: SessionEvent) => void): void
}
```

This is an interface, not an abstract base class. The two implementations share a contract but almost no logic — one makes HTTP calls to a cloud API, the other manages local processes and worktrees. There's no meaningful shared implementation to inherit. If common patterns emerge later (event validation, retry logic, logging), a base class can be extracted then.

**Cloud adapter (runs server-side):**

```typescript
class FlyAdapter implements SessionAdapter {
  // start()     → calls Fly Machines API to create a Machine, clone repo, boot container
  // send()      → forwards event to the bridge process inside the Fly container
  // pause()     → calls Fly Machines API to stop the Machine (no cost while stopped)
  // resume()    → calls Fly Machines API to start the Machine back up
  // terminate() → calls Fly Machines API to destroy the Machine, release volume
  // onEvent()   → listens on the bridge connection for events from the container
}
```

**Local adapter (runs in Electron):**

```typescript
class LocalAdapter implements SessionAdapter {
  // start()     → creates git worktree, spawns coding tool via CodingToolAdapter
  // send()      → pipes event to coding tool via CodingToolAdapter
  // pause()     → suspends the coding tool process, preserves worktree
  // resume()    → respawns the process, feeds conversation history from Trace
  // terminate() → kills the process, cleans up worktree (git worktree remove)
  // onEvent()   → captures coding tool output via CodingToolAdapter, serializes as events
}
```

**Coding tool adapter.** The `SessionAdapter` handles *where* a session runs. A second interface handles *what* coding tool runs inside it. Claude Code and Cursor have completely different input/output protocols — different ways to spawn, send messages, and parse output. This should be an explicit boundary rather than something buried inside the session adapter.

```typescript
interface CodingToolAdapter {
  spawn(workingDir: string, config: ToolConfig): Promise<ToolProcess>
  sendMessage(process: ToolProcess, message: string): Promise<void>
  onOutput(process: ToolProcess, callback: (event: SessionEvent) => void): void
  kill(process: ToolProcess): Promise<void>
}

class ClaudeCodeAdapter implements CodingToolAdapter {
  // spawn()       → starts `claude` CLI process in the working directory
  // sendMessage() → writes to the process stdin in Claude Code's expected format
  // onOutput()    → parses Claude Code's stdout stream into structured SessionEvents
  // kill()        → sends SIGTERM to the process
}

class CursorAdapter implements CodingToolAdapter {
  // spawn()       → launches Cursor's headless/agent mode
  // sendMessage() → sends message via Cursor's protocol
  // onOutput()    → parses Cursor's output into structured SessionEvents
  // kill()        → terminates the Cursor process
}
```

The session adapter composes with the coding tool adapter. The `LocalAdapter` uses a `CodingToolAdapter` to manage the tool process — it handles worktrees and lifecycle, while delegating the tool-specific communication to the coding tool adapter. The `FlyAdapter` doesn't call the coding tool adapter directly (the bridge inside the Fly container does), but the bridge process inside the container uses the same `CodingToolAdapter` interface. Adding support for a new coding tool means implementing one new `CodingToolAdapter` — no changes to the session adapter, the router, or anything else in the platform.

**The session router (runs server-side):**

The router is the dispatch layer that sits between the service layer and the session adapters. It's the single place that knows about hosting modes:

```typescript
class SessionRouter {
  private flyAdapter: FlyAdapter
  private bridgeConnections: Map<string, WebSocket>  // sessionId → bridge WS

  async send(sessionId: string, event: SessionEvent): Promise<void> {
    const session = await this.getSession(sessionId)

    if (session.hosting === "cloud") {
      await this.flyAdapter.send(sessionId, event)
    } else {
      const bridge = this.bridgeConnections.get(sessionId)
      if (!bridge) throw new SessionUnreachableError(sessionId)
      bridge.send(JSON.stringify({ type: "send", event }))
    }
  }

  // pause(), resume(), terminate() follow the same pattern
}
```

For cloud sessions, the router calls the `FlyAdapter` directly on the server. For local sessions, the router sends the command over a bridge WebSocket to the Electron app, which executes it via the `LocalAdapter` on the user's machine.

**The bridge WebSocket:**

Local sessions maintain a persistent bidirectional WebSocket between the Electron app and the Trace server:

```
WS /bridge/sessions/{id}
```

**Inbound (Trace → Electron):** User messages directed at the session, session control commands (pause, resume, terminate) from any source (other users, agents, the owner on another device).

**Outbound (Electron → Trace):** Tool invocation events, tool results, file changes, AI responses, status updates — everything the coding tool produces.

On the Electron side, a thin translation layer maps bridge commands to local adapter calls:

```typescript
bridge.onMessage((msg) => {
  switch (msg.type) {
    case "send":      localAdapter.send(msg.sessionId, msg.event); break;
    case "pause":     localAdapter.pause(msg.sessionId); break;
    case "resume":    localAdapter.resume(msg.sessionId); break;
    case "terminate": localAdapter.terminate(msg.sessionId); break;
  }
})
```

**Unified data flow.** Whether a session is cloud or local, the event flow is the same from every other component's perspective:

```
Any user/agent sends a message to session
  → User: GraphQL mutation → Service Layer / Agent: Service Layer directly
  → Session Router dispatches:
      Cloud: FlyAdapter.send() → bridge in Fly container → coding tool
      Local: bridge WebSocket → Electron → LocalAdapter.send() → coding tool
  → Coding tool produces events
  → Events flow back through the bridge to the service layer
  → Service layer appends to event store, broadcasts to all subscribers
  → All frontends (web, mobile, Electron, other users) update via GraphQL subscriptions
```

The owner of a local session also receives their own messages back through the event stream, just like everyone else. The Electron frontend can optimistically render the owner's messages immediately for perceived responsiveness, then reconcile when the event comes back from Trace.

**Electron as dual-role client.** The Electron app is both a frontend and a bridge simultaneously. The frontend side renders the UI and subscribes to session events via the normal real-time stream — identical to the web or mobile client. The bridge side manages local coding tool processes and maintains the bridge WebSocket. These are logically separate concerns running in the same application. The bridge side could theoretically be extracted into a standalone CLI process, but bundling it in Electron keeps the setup simple for users.

### 8.3 Cloud Session Infrastructure

Cloud sessions are full remote development environments — not just code execution sandboxes. A cloud session gives the user a running container with shell access, port forwarding, and the complete dev environment, all accessible through Trace's UI.

**Hosting backend: Fly Machines.** Cloud sessions run as Docker containers on Fly.io's Machines platform. Fly Machines are individually addressable containers with built-in SSH access, persistent volumes, stop/resume lifecycle, and multi-port support. The operational model is simple: deploy a Docker image, it runs, expose ports, SSH in, stop it when idle (no cost while stopped), resume it later with the filesystem intact. No Kubernetes, no microVM orchestration, no complex infrastructure to manage.

**Session container image.** Every cloud session boots from a standard Docker image that includes:

- The coding tool (Claude Code, etc.) installed and configured
- A bridge process that connects to Trace via the bridge WebSocket — the same bidirectional protocol used by the Electron bridge for local sessions
- `ttyd` for web-based terminal access over WebSocket
- A port watcher daemon that detects when new ports start listening
- Git, standard build tools, and a base development environment

Repo-specific setup is defined in a `.trace/config.yml` file committed to the repository:

```yaml
# .trace/config.yml
runtime:
  image: node:20          # base image override (optional)
  resources:
    cpu: 2
    memory: 4gb

setup:
  - npm install
  - npm run db:migrate
  - cp .env.example .env

ports:
  - port: 3000
    label: "Frontend"
  - port: 8080
    label: "API"

on_ready:
  - npm run dev            # runs after setup, before coding tool starts
```

**Provisioning flow (cloud):**

```
User starts cloud session
  → GraphQL startSession mutation → Service Layer
  → Session Router dispatches to FlyAdapter.start()
  → FlyAdapter calls Fly Machines API to create a Machine from the session image
  → Machine boots: clones repo, runs setup commands from .trace/config.yml
  → on_ready commands start (e.g., dev server in background)
  → Bridge process inside container connects to Trace via bridge WebSocket
  → Events flow bidirectionally through the bridge
  → Port watcher detects listening ports, registers URLs with Trace
  → Session status → "active", endpoints populated
```

**Exposed shells.** Each cloud session exposes one or more interactive terminal sessions via `ttyd`, a lightweight WebSocket-to-PTY bridge running inside the container. Trace's frontend connects to the terminal server through a proxied WebSocket. Terminal sessions are multiplayer-observable — organization members can watch what's happening in the shell, just like every other event in Trace. Terminal I/O is treated as ephemeral streaming data relayed in real time but not persisted to the main event store. Meaningful terminal events — command executed, exit code returned — are captured as proper session events.

**Port forwarding.** The port watcher daemon monitors for new listening ports inside the container. When detected, it registers them with Trace's API, which generates a routable preview URL for each port (e.g., `https://{session-id}-3000.trace.dev`). Preview URLs are authenticated — only organization members can access them. These URLs are shareable in channels and tickets. The ambient agent can also use them — hitting preview URLs with a headless browser, taking screenshots, and posting results to a ticket.

**Idle management.** Coding sessions have a bursty usage pattern — intense activity, then quiet while the developer reads and thinks. To avoid paying for idle compute, Trace sets an idle timeout (configurable, default 10 minutes of no events). On timeout, Trace calls the Fly Machines API to stop the Machine. The persistent volume retains the filesystem. On the next interaction, Trace resumes the Machine — typically under 5 seconds — and the bridge reconnects. The session status transitions: `active → paused → active`.

**Session resume.** When a paused session is resumed, Trace calls the Fly Machines API to start the Machine back up. The persistent volume retains the full filesystem — repo state, installed packages, everything. The bridge reconnects to Trace and resumes streaming events. The coding tool picks up from the conversation history stored in Trace's event store. Resume is fast (under 5 seconds) and seamless from the user's perspective.

**Local sessions.** For sessions running on the developer's machine, the Electron app runs the `LocalAdapter` (see Section 8.2) — creating git worktrees, spawning the coding tool process, and managing its lifecycle. The bridge WebSocket connects the Electron app to Trace's server, receiving commands (messages, pause, terminate) and pushing events (tool output, file changes) back. From the platform's perspective, events are identical regardless of hosting mode. The only differences: local sessions don't have Trace-managed endpoints (no preview URLs, no managed terminals), and they can become `unreachable` if the developer's machine goes offline and the bridge WebSocket disconnects.

### 8.4 Agent Runtime

The ambient agent runs as a server-side service that subscribes to the event stream directly via the real-time broker — not through GraphQL subscriptions. It calls the service layer directly to take actions — not through GraphQL mutations. It's a first-class server-side component, not an external client.

Its architecture:

```
Event Stream → Filter/Router → Intent Classifier → Action Planner → Executor → Service Layer
```

- **Filter/Router.** Determines which events are worth processing (ignore ephemeral events, presence updates, etc.).
- **Intent Classifier.** Uses the LLM adapter to analyze the event in context and determine what, if anything, the agent should do.
- **Action Planner.** Decides on a specific action and constructs the appropriate service call.
- **Executor.** Calls the service layer directly (e.g., `ticketService.create()`, `sessionService.start()`), producing new events that flow back into the stream.

The agent runtime is stateless between events (all state is in the event log) and horizontally scalable.

**LLM adapter.** The agent runtime (and potentially other parts of the platform) needs to call language models for intent classification, ticket description generation, research synthesis, and comment responses. This is behind an interface so the platform isn't hardcoded to a single provider, and so different tasks can use different models — a fast cheap model for intent classification, a more capable model for research and code review.

```typescript
interface LLMAdapter {
  complete(messages: Message[], options: CompletionOptions): Promise<LLMResponse>
  stream(messages: Message[], options: CompletionOptions): AsyncIterable<LLMChunk>
}

class AnthropicAdapter implements LLMAdapter {
  // complete() → calls Claude API, returns full response
  // stream()   → calls Claude API with streaming, yields chunks
}

class OpenAIAdapter implements LLMAdapter {
  // complete() → calls OpenAI API, returns full response
  // stream()   → calls OpenAI API with streaming, yields chunks
}
```

Organizations can configure which model powers the agent and potentially set different models for different tasks. The agent runtime resolves the adapter at call time based on configuration — it never imports a specific provider directly.

### 8.5 Adapter Summary

Three interfaces define Trace's pluggable boundaries:

| Interface | Axis | Implementations | Used by |
|---|---|---|---|
| `SessionAdapter` | Where the session runs | `FlyAdapter` (cloud), `LocalAdapter` (Electron) | Session Router (in service layer) |
| `CodingToolAdapter` | What coding tool runs | `ClaudeCodeAdapter`, `CursorAdapter`, etc. | Session adapters, bridge process |
| `LLMAdapter` | What model powers AI features | `AnthropicAdapter`, `OpenAIAdapter`, etc. | Agent runtime, service layer |

Adding a new hosting mode, coding tool, or LLM provider means implementing one interface. No other part of the platform changes. GraphQL resolvers, the agent runtime, and all other consumers go through the service layer, which resolves the correct adapter implementation based on configuration.

### 8.6 Frontend Architecture

Trace's event stream is high-frequency. A coding session emits 10+ events per second. A busy channel has multiple concurrent conversations. The agent constantly produces observations and suggestions. The frontend must handle all of this without frame drops. The architecture is designed around one principle: **every event should re-render the minimum number of components possible — ideally one.**

#### 8.6.1 Subscription Model

The frontend uses **viewport-driven subscriptions with lazy hydration** rather than streaming every event to every client.

**Three subscription tiers:**

**Always subscribed (ambient tier).** A lightweight, filtered stream that stays open for the lifetime of the client session. Covers: unread counts per channel, ticket assignments directed at the user, @mentions, agent suggestions awaiting approval, and presence updates. This is a narrow slice of the full event stream — just enough for badges, notifications, and awareness.

**Active viewport.** When the user opens a channel, the client subscribes to that channel's event stream. When they navigate to a coding session, they subscribe to that session's events. On navigate away, unsubscribe. The client holds materialized state only for what's currently visible, plus optionally one level of navigation depth for snappy back-navigation (e.g., keep the last channel in memory when drilling into a thread).

**On-demand hydration.** When the user opens something for the first time (a ticket, an old session, a channel they haven't visited), the client fetches the current materialized state via a GraphQL query, then subscribes to the real-time stream from that point forward. This avoids replaying event history to build state.

#### 8.6.2 Normalized Entity Cache (Zustand)

All entities are stored flat in a normalized Zustand store, keyed by type and ID. This is the single most important performance decision — it turns "re-render the world on every event" into "re-render one component."

```typescript
// Cache shape — flat, normalized, no nesting
{
  sessions: {
    "session_abc": { id: "session_abc", name: "Fix Safari bug", status: "active", tool: "claude-code", ... },
    "session_def": { id: "session_def", name: "Refactor auth", status: "paused", tool: "cursor", ... },
  },
  tickets: {
    "ticket_xyz": { id: "ticket_xyz", title: "Safari date crash", status: "in_progress", ... },
  },
  channels: { ... },
  users: { ... },
  repos: { ... },
  projects: { ... },
}
```

When a subscription event arrives, the event processor determines which entities are affected and updates only those cache entries. Components that read from those entries re-render. Everything else stays untouched. A session status change re-renders the one `SessionCard` that displays it — not the channel sidebar, not the ticket board, not the message list.

#### 8.6.3 Event Processing Pipeline

Incoming subscription events don't directly trigger component updates. They flow through a processing pipeline that decouples the network layer from the render layer:

```
GraphQL subscription receives event (via urql transport)
  → Event processor extracts entity updates from event payload
  → Zustand entity store applies targeted updates (write only changed fields)
  → Zustand selectors detect which slices changed
  → Only components whose selected fields changed re-render
```

The event processor is the only thing that writes to the Zustand entity store. Components never write to it directly. This creates a unidirectional data flow: events in → store update → selective re-render.

#### 8.6.4 Component-Level Selectors

Each component subscribes to exactly the data it needs via fine-grained Zustand selector hooks. Components take entity IDs as props and read specific fields from the store — never entire objects.

```typescript
// ❌ Bad — re-renders on ANY change to the session entity
function SessionCard({ session }: { session: Session }) {
  return <div>{session.name} — {session.status}</div>
}

// ✅ Good — re-renders only when name or status changes
function SessionCard({ sessionId }: { sessionId: string }) {
  const name = useEntityField('session', sessionId, 'name')
  const status = useEntityField('session', sessionId, 'status')
  return <div>{name} — {status}</div>
}

// ✅ Good — SessionPorts re-renders on endpoint changes,
//           SessionCard does NOT re-render
function SessionPorts({ sessionId }: { sessionId: string }) {
  const ports = useEntityField('session', sessionId, 'endpoints.ports')
  return <ul>{ports.map(p => <li key={p.port}>{p.label}: {p.url}</li>)}</ul>
}
```

The `useEntityField` hook reads a specific path from a specific entity in the Zustand entity store and only triggers a re-render when that specific value changes (via Zustand's shallow equality check on the selector). This means:

- A session event stream update (new AI response) doesn't re-render the session's status badge
- A ticket priority change doesn't re-render the ticket's comment list
- A channel unread count change doesn't re-render the message list inside the channel
- A user's presence change re-renders their avatar indicator and nothing else

#### 8.6.5 List Virtualization

Message lists, session event logs, and ticket lists are virtualized — only the items visible in the viewport are rendered to the DOM. A channel with 10,000 messages renders ~20 at a time. A session with 500 tool invocations renders only the visible ones.

Each list item is a component that subscribes to its own entity ID via selectors. Scrolling mounts and unmounts item components, but mounting is cheap because the data is already in the normalized cache — no network requests.

Combined with the normalized cache, this means:

- A new message arriving in a channel appends one item to the cache and renders one new component at the bottom of the visible list (if the user is scrolled to the bottom). The other 19 visible messages don't re-render. The 9,980 off-screen messages aren't in the DOM at all.
- A session event arriving renders one new event component. The input box, the session header, the linked ticket card, and every other event in the list are untouched.

#### 8.6.6 Optimistic Updates

When the user performs an action (sends a message, creates a ticket, pauses a session), the frontend optimistically writes to the cache immediately — before the server round-trip. The UI updates instantly. When the server event comes back through the subscription, the event processor reconciles it with the optimistic entry (matching on a client-generated correlation ID). If the server confirms, the optimistic entry is replaced with the canonical version. If the server rejects, the optimistic entry is rolled back.

This matters most for the session owner on local sessions, where messages route through Trace's server before reaching the coding tool on the same machine. Without optimistic updates, the user would see a ~100ms delay between typing a prompt and seeing it appear in the UI.

#### 8.6.7 Cross-Scope References

When a channel message references a ticket or a session event links to a channel, the component needs enough context to render the reference without subscribing to the referenced scope. Two mechanisms handle this:

**Denormalized summaries in event payloads.** A `ticket.created` event flowing into a channel includes the ticket title and status inline. The event processor writes these summaries into the normalized cache as lightweight entity stubs. If the user later navigates to the full ticket, the stub gets replaced with the full entity from the hydration query.

**Entity stub cache with LRU eviction.** Referenced entities that don't come from event payloads are fetched on-demand as lightweight stubs (just ID, name, status) and cached with LRU eviction. A `SessionCard` that displays a linked ticket's title fetches the stub once and caches it. These stubs are separate from full entities and don't trigger subscription overhead.

#### 8.6.8 State Management Stack

**Zustand is the single state management solution.** There is no React context for state. No Apollo or urql normalized cache. No `useState` for anything that could be shared between components. Every piece of reactive state in the application lives in Zustand stores. This is non-negotiable — one system means one mental model, one place to debug, and one reactivity mechanism controlling re-renders.

**Zustand store structure.** The app uses multiple focused Zustand stores, not one monolithic store. Each store owns a specific domain:

```typescript
// Entity cache — normalized, flat, all server-synced entities
const useEntityStore = create<EntityStore>((set, get) => ({
  sessions: {},
  tickets: {},
  channels: {},
  users: {},
  repos: {},
  projects: {},
  // Targeted updates — only touch the entity that changed
  updateEntity: (type, id, patch) =>
    set(state => ({
      [type]: { ...state[type], [id]: { ...state[type][id], ...patch } }
    })),
}))

// UI state — local to the app, not server-synced
const useUIStore = create<UIStore>((set) => ({
  activeSidebarTab: 'channels',
  expandedThreadId: null,
  commandPaletteOpen: false,
  // ...
}))

// Subscription state — tracks active subscriptions and connection health
const useSubscriptionStore = create<SubscriptionStore>((set) => ({
  activeScopes: new Set<string>(),
  connectionStatus: 'connected',
  // ...
}))
```

**Component-local state.** `useState` is allowed only for state that is truly local to a single component and has no possible consumer elsewhere — a text input's current value before submission, a dropdown's open/closed state, an animation flag. If two components ever need the same piece of state, it moves to a Zustand store immediately. When in doubt, put it in Zustand.

**GraphQL client (urql)** is used purely as a transport layer. It sends queries, executes mutations, and manages the subscription WebSocket connection. Its built-in cache is disabled or set to network-only. All query results are intercepted and normalized into the Zustand entity store. All subscription events are routed through the event processor into Zustand. The GraphQL client never triggers re-renders — Zustand does, through its selectors.

```typescript
// Query result flows into Zustand, not into component state
async function hydrateChannel(channelId: string) {
  const result = await gqlClient.query(ChannelQuery, { id: channelId })
  const { channel, messages } = normalize(result.data)
  useEntityStore.getState().mergeEntities('channels', channel)
  useEntityStore.getState().mergeEntities('messages', messages)
  // Components reading from these cache keys re-render automatically
}
```

**Virtualization library (@tanstack/virtual)** for all lists — messages, session events, ticket lists, sidebar items.

**No other state libraries.** No Redux, no Jotai, no Recoil, no MobX, no React Query for cache management. Zustand + urql-as-transport covers everything. Adding a second reactive system introduces competing re-render triggers that are nearly impossible to debug.

#### 8.6.9 Code Quality & Conventions

AI-generated frontend code trends toward bloated files with tangled concerns. Every component becomes a god component — data fetching, business logic, event handling, and presentation all in one 500-line file. This is the primary source of performance bugs, maintenance nightmares, and sluggish UIs. The following conventions are non-negotiable.

**Hard file size limit: 150 lines.** No component file exceeds 150 lines including imports. If a file is approaching this limit, it must be split. This is enforced by linting, not by judgment. The limit forces decomposition early, before files become untangleable. Utility functions and hooks have the same limit.

**Separation of concerns via file structure.** Every feature or component group follows a consistent internal structure that physically separates data, logic, and presentation:

```
src/features/session/
├── components/
│   ├── SessionCard.tsx              # Pure presentation — props in, JSX out
│   ├── SessionEventList.tsx         # Virtualized list, renders SessionEventItem
│   ├── SessionEventItem.tsx         # Single event row
│   ├── SessionHeader.tsx            # Name, status badge, tool icon
│   ├── SessionPorts.tsx             # Port list with preview URLs
│   ├── SessionTerminal.tsx          # Terminal embed wrapper
│   └── SessionControls.tsx          # Pause/resume/terminate buttons
├── hooks/
│   ├── useSession.ts                # Selector hook — reads session fields from Zustand
│   ├── useSessionEvents.ts          # Subscription hook — manages event stream subscription
│   ├── useSessionActions.ts         # Mutation hook — startSession, pauseSession, etc.
│   └── useSessionPorts.ts           # Selector hook — reads port/endpoint data
├── utils/
│   ├── sessionStatus.ts             # Status display logic, color mapping
│   └── sessionFilters.ts            # Filter/sort logic for session lists
└── index.ts                         # Public exports
```

**Three component categories with strict rules:**

**Container components** connect to data. They use hooks to read from the Zustand store and call mutations via urql. They pass primitive values and entity IDs down to presentational components. They contain zero visual markup beyond composing child components. They never receive entire entity objects as props.

```typescript
// Container — data connection only, no JSX beyond composition
function SessionCardContainer({ sessionId }: { sessionId: string }) {
  const name = useEntityField('session', sessionId, 'name')
  const status = useEntityField('session', sessionId, 'status')
  const tool = useEntityField('session', sessionId, 'tool')
  const { pauseSession } = useSessionActions()

  return (
    <SessionCard
      name={name}
      status={status}
      tool={tool}
      onPause={() => pauseSession(sessionId)}
    />
  )
}
```

**Presentational components** render UI. They receive only primitive props (strings, numbers, booleans, callbacks). They never import hooks that read from Zustand or call mutations. They never reference entity IDs — they don't know the store exists. This makes them trivially testable, reusable, and immune to store-triggered re-renders.

```typescript
// Presentational — pure props, no data hooks, no store access
function SessionCard({ name, status, tool, onPause }: SessionCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.name}>{name}</span>
      <StatusBadge status={status} />
      <ToolIcon tool={tool} />
      <button onClick={onPause}>Pause</button>
    </div>
  )
}
```

**Hook files** contain all data logic. Each hook does one thing: read a specific slice of data, manage a subscription lifecycle, or wrap a set of related mutations. Hooks never contain JSX. Hooks never contain styling logic. A hook file that's doing more than one concern gets split into multiple hooks.

```typescript
// hooks/useSession.ts — reads session fields from Zustand entity store
export function useSessionField<K extends keyof Session>(
  sessionId: string,
  field: K
): Session[K] {
  return useEntityStore(
    useCallback((state) => state.sessions[sessionId]?.[field], [sessionId, field]),
    shallow
  )
}

// hooks/useSessionActions.ts — wraps GraphQL mutations, returns stable callbacks
export function useSessionActions() {
  const client = useUrqlClient()
  return useMemo(() => ({
    start: (input: StartSessionInput) => client.mutation(StartSessionMutation, { input }),
    pause: (id: string) => client.mutation(PauseSessionMutation, { id }),
    resume: (id: string) => client.mutation(ResumeSessionMutation, { id }),
    terminate: (id: string) => client.mutation(TerminateSessionMutation, { id }),
  }), [client])
}
```

**Props rules:**

- Never pass entity objects as props. Pass IDs to containers, pass primitives to presentational components.
- Callbacks passed as props must be stable references (wrapped in `useCallback` or returned from `useMemo` in hooks). Unstable callbacks cause child re-renders on every parent render.
- Props interfaces are defined in the same file as the component, not in a shared types file. This keeps the contract visible and co-located.
- No more than 7 props per component. More than 7 means the component is doing too much and should be split.

**Naming conventions:**

- Feature folders are domain-named: `session/`, `channel/`, `ticket/`, `project/`, not `components/`, `hooks/`, `utils/` at the top level. Shared primitives (buttons, badges, icons) live in `src/shared/`.
- Container components are suffixed: `SessionCardContainer.tsx`. Presentational components are unsuffixed: `SessionCard.tsx`.
- Hooks are prefixed with `use` and named after what they return, not what they do internally: `useSession`, `useSessionActions`, `useChannelMessages`. Not `useFetchSessionData` or `useHandleSessionStuff`.
- Event handlers in components are named `on{Event}`: `onPause`, `onSend`, `onClick`. The hook-level functions they call are named as actions: `pauseSession`, `sendMessage`.

**No inline logic in JSX.** Conditional rendering, computed values, and transformations are extracted into variables above the return statement or into utility functions. The JSX block should be readable as a layout description, not a logic puzzle:

```typescript
// ❌ Bad
return <div>{items.filter(i => i.status === 'active').length > 0 && <span>{items.filter(i => i.status === 'active').map(i => i.name).join(', ')}</span>}</div>

// ✅ Good
const activeItems = items.filter(i => i.status === 'active')
const hasActive = activeItems.length > 0
const activeNames = activeItems.map(i => i.name).join(', ')

return <div>{hasActive && <span>{activeNames}</span>}</div>
```

**No `useEffect` for derived state.** If a value can be computed from existing state or props, compute it during render with `useMemo` or a plain variable. `useEffect` that sets state based on other state is the single most common source of unnecessary re-renders, stale closures, and infinite loops in React code:

```typescript
// ❌ Bad — useEffect to derive state causes extra render
const [isActive, setIsActive] = useState(false)
useEffect(() => {
  setIsActive(status === 'active')
}, [status])

// ✅ Good — derived inline, no extra render
const isActive = status === 'active'
```

**Subscription lifecycle management.** Every GraphQL subscription is managed by a custom hook that handles subscribe, unsubscribe, and cleanup. Subscriptions are tied to component mount/unmount via the hook. No subscription is ever opened in a `useEffect` with manual cleanup — use a dedicated `useSubscription` hook that encapsulates the lifecycle:

```typescript
// hooks/useSessionEvents.ts
export function useSessionEvents(sessionId: string | null) {
  useSubscription(
    sessionId ? { query: SessionEventsSubscription, variables: { sessionId } } : null,
    (event) => eventProcessor.process(event)  // normalizes and writes to Zustand entity store
  )
}
```

When `sessionId` is null (user navigated away), the hook unsubscribes. When `sessionId` changes (user opened a different session), it unsubscribes from the old and subscribes to the new. The component doesn't manage any of this. The event processor writes to the Zustand entity store, and only components whose selectors match the changed data re-render.

---

## 9. Permissions & Trust Model

### 9.1 Actor Permissions

Every organization member — human or agent — has a permission set:

- **Admin.** Full control over organization settings, members, and all entities.
- **Member.** Can create, edit, and interact with all entities within the organization.
- **Observer.** Read-only access to the event stream.
- **Custom roles.** Organizations can define custom roles with granular permissions.

Agents default to Member permissions but can be scoped down. For example, an agent might have permission to create tickets but not delete them, or to start coding sessions but not merge code.

### 9.2 Agent Trust Levels

Agent actions have configurable trust levels:

- **Autonomous.** The agent acts without confirmation (e.g., adding labels, linking entities, posting informational comments).
- **Suggest.** The agent proposes an action that requires user approval (e.g., creating a ticket, reassigning work, starting a session).
- **Blocked.** The agent cannot perform this action (e.g., deleting tickets, removing members).

Trust levels are configurable per organization and per action type. Teams can start conservative and increase autonomy as they build confidence in the agent's behavior.

---

## 10. What Trace Is Not

It's worth being explicit about scope boundaries:

- **Trace is not a code editor.** It orchestrates AI coding sessions and provides cloud dev environments (shells, port forwarding, preview URLs) but does not provide a built-in IDE or text editor. Sessions delegate to external coding tools via adapters.
- **Trace is not a git hosting platform.** Repos are first-class entities in Trace, but Trace doesn't host git repositories. It reads metadata from your existing repos (via `git remote`) and clones from your existing provider (GitHub, GitLab, etc.) for cloud sessions.
- **Trace is not a CI/CD system.** It can trigger and observe pipelines but does not run them.
- **Trace is not a general-purpose AI chat.** The ambient agent is purpose-built for engineering workflows. It's not a replacement for ChatGPT or Claude.ai.

---

## 11. Open Questions

These are unresolved design decisions for the next iteration of this document:

1. **Event retention & storage costs.** How long do we retain the full event log? What is the archival strategy for old sessions with thousands of tool invocation events?

2. **Agent model selection.** Should the ambient agent be hardcoded to a specific model (e.g., Claude), or should organizations be able to configure which model powers the agent? (The adapter architecture supports pluggability, but the default matters.)

3. **Multi-organization agents.** Can an agent span multiple organizations? This has implications for data isolation and context management.

4. **Session cost management.** Coding sessions generate significant API costs (both LLM and compute). How do we surface, track, and budget these costs at the organization level? Fly Machines are billed per-second when running, so idle management directly impacts cost.

5. **Conflict resolution in multiplayer sessions.** What happens when two users send conflicting instructions to the same coding session simultaneously?

6. **Custom agent behaviors.** Beyond the ambient agent, should users be able to define custom agents with specific triggers and behaviors (a la GitHub Actions)?

7. **External integrations.** What's the initial set of integrations (GitHub, GitLab, Slack import, Linear import)? How deep do they go?

8. **Offline/degraded mode.** What works when the user is offline or on poor mobile connectivity? The viewport subscription model helps (less data to sync), but message drafts, ticket creation, and queue-and-retry need design work.

9. **Pricing model.** Per-seat? Per-event? Per-session? Hybrid? Agent usage and cloud compute are major cost drivers that don't map cleanly to traditional SaaS pricing.

10. **devcontainer.json adoption.** Should `.trace/config.yml` be replaced with or supplemented by the industry-standard `devcontainer.json` format? Adopting it would give free compatibility with existing project configurations from Codespaces and Gitpod users, at the cost of less control over Trace-specific features.

---

## 12. Success Metrics

**North Star:** Time from problem identification to deployed fix — measured end-to-end from the first event where a problem surfaces (a message, a failed test, an alert) to the event where the fix is deployed.

**Leading Indicators:**

- Percentage of tickets created by agents vs. manually
- Average context switches per developer per task (target: approaching zero)
- Time-to-first-agent-action after a new event (latency of the ambient agent)
- Session-to-ticket link rate (how often coding work is connected to project tracking)
- Mobile DAU as a percentage of total DAU (indicator of true mobile-first usage)
- Agent suggestion acceptance rate (indicator of agent quality and trust)

---

## 13. Phased Delivery

### Phase 1 — Foundation (Months 1–3)
Event store, organization & channel primitives, repo discovery via CLI, basic messaging, user auth, real-time sync with viewport-driven subscriptions, mobile shell app.

### Phase 2 — Sessions (Months 3–5)
Session model, Claude Code adapter, session event streaming, multiplayer observation, session-channel linking. Cloud session infrastructure on Fly Machines: container image, bridge process, `.trace/config.yml` setup flow. Local session bridge CLI with git worktree support.

### Phase 3 — Cloud Dev Environment (Months 5–6)
Web-based terminal access via `ttyd`, dynamic port detection and preview URLs, idle management (auto-stop/resume). Local session bridge CLI (`trace connect`).

### Phase 4 — Tickets (Months 6–8)
Ticket model, board UI, ticket-event linking, origin tracking, comments, labels, assignment.

### Phase 5 — Ambient Agent (Months 8–11)
Agent runtime, event stream processing, ticket creation from conversations, comment responses, proactive suggestions, trust level configuration.

### Phase 6 — Polish & Expand (Months 11–14)
Additional coding tool adapters, external integrations, advanced agent behaviors, mobile feature parity, performance optimization, public API documentation.

---

*End of document. This is a living document — expect significant revision as architectural decisions are validated and user research is incorporated.*
