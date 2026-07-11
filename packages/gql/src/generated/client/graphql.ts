/* eslint-disable */
import { JsonValue } from "../../json";
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: string; output: string };
  JSON: { input: JsonValue; output: JsonValue };
};

export type Actor = {
  __typename?: "Actor";
  avatarUrl?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  name?: Maybe<Scalars["String"]["output"]>;
  type: ActorType;
};

export type ActorType = "agent" | "system" | "user";

export type AddChannelMemberInput = {
  channelId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type AddChatMemberInput = {
  chatId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type AgentEnvironment = {
  __typename?: "AgentEnvironment";
  adapterType: AgentEnvironmentAdapterType;
  config: Scalars["JSON"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  enabled: Scalars["Boolean"]["output"];
  id: Scalars["ID"]["output"];
  isDefault: Scalars["Boolean"]["output"];
  name: Scalars["String"]["output"];
  orgId: Scalars["ID"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type AgentEnvironmentAdapterType = "local" | "provisioned";

export type AgentEnvironmentTestResult = {
  __typename?: "AgentEnvironmentTestResult";
  message?: Maybe<Scalars["String"]["output"]>;
  ok: Scalars["Boolean"]["output"];
};

export type AgentStatus = "active" | "done" | "failed" | "not_started" | "stopped";

export type AiConversation = {
  __typename?: "AiConversation";
  branchCount: Scalars["Int"]["output"];
  branches: Array<Branch>;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  id: Scalars["ID"]["output"];
  rootBranch: Branch;
  title?: Maybe<Scalars["String"]["output"]>;
  updatedAt: Scalars["DateTime"]["output"];
  visibility: AiConversationVisibility;
};

export type AiConversationEvent = {
  __typename?: "AiConversationEvent";
  conversationId: Scalars["ID"]["output"];
  payload: Scalars["JSON"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type AiConversationVisibility = "ORG" | "PRIVATE";

export type ApiTokenProvider = "anthropic" | "codex_access_token" | "github" | "openai" | "ssh_key";

export type ApiTokenStatus = {
  __typename?: "ApiTokenStatus";
  isSet: Scalars["Boolean"]["output"];
  provider: ApiTokenProvider;
  updatedAt?: Maybe<Scalars["DateTime"]["output"]>;
};

export type ApplicationProcessStatus =
  | "exited"
  | "failed"
  | "running"
  | "starting"
  | "stopped"
  | "stopping";

export type Branch = {
  __typename?: "Branch";
  childBranches: Array<Branch>;
  conversation: AiConversation;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  depth: Scalars["Int"]["output"];
  forkTurn?: Maybe<Turn>;
  id: Scalars["ID"]["output"];
  label?: Maybe<Scalars["String"]["output"]>;
  parentBranch?: Maybe<Branch>;
  turnCount: Scalars["Int"]["output"];
  turns: Array<Turn>;
};

export type BranchDiffFile = {
  __typename?: "BranchDiffFile";
  additions: Scalars["Int"]["output"];
  deletions: Scalars["Int"]["output"];
  path: Scalars["String"]["output"];
  status: Scalars["String"]["output"];
};

export type BridgeAccessCapability = "session" | "terminal";

export type BridgeAccessGrant = {
  __typename?: "BridgeAccessGrant";
  capabilities: Array<BridgeAccessCapability>;
  createdAt: Scalars["DateTime"]["output"];
  expiresAt?: Maybe<Scalars["DateTime"]["output"]>;
  grantedByUser: User;
  granteeUser: User;
  id: Scalars["ID"]["output"];
  revokedAt?: Maybe<Scalars["DateTime"]["output"]>;
  scopeType: BridgeAccessScopeType;
  sessionGroup?: Maybe<SessionGroup>;
};

export type BridgeAccessRequest = {
  __typename?: "BridgeAccessRequest";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  ownerUser: User;
  requestedCapabilities: Array<BridgeAccessCapability>;
  requestedExpiresAt?: Maybe<Scalars["DateTime"]["output"]>;
  requesterUser: User;
  resolvedAt?: Maybe<Scalars["DateTime"]["output"]>;
  resolvedByUser?: Maybe<User>;
  scopeType: BridgeAccessScopeType;
  sessionGroup?: Maybe<SessionGroup>;
  status: BridgeAccessRequestStatus;
};

export type BridgeAccessRequestStatus = "approved" | "denied" | "pending";

export type BridgeAccessScopeType = "all_sessions" | "session_group";

export type BridgeRuntime = {
  __typename?: "BridgeRuntime";
  accessGrants: Array<BridgeAccessGrant>;
  accessRequests: Array<BridgeAccessRequest>;
  connected: Scalars["Boolean"]["output"];
  connectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  disconnectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  hostingMode: HostingMode;
  id: Scalars["ID"]["output"];
  instanceId: Scalars["ID"]["output"];
  label: Scalars["String"]["output"];
  lastSeenAt: Scalars["DateTime"]["output"];
  /**
   * Currently-attached linked checkouts on this bridge, one per repo at most.
   * Empty when nothing is synced or the bridge is offline. Sourced from the
   * in-memory router cache, which is warmed on bridge connect.
   */
  linkedCheckouts: Array<LinkedCheckoutStatus>;
  metadata?: Maybe<Scalars["JSON"]["output"]>;
  ownerUser: User;
  registeredRepoIds: Array<Scalars["ID"]["output"]>;
};

export type BridgeRuntimeAccess = {
  __typename?: "BridgeRuntimeAccess";
  allowed: Scalars["Boolean"]["output"];
  bridgeRuntimeId?: Maybe<Scalars["ID"]["output"]>;
  capabilities: Array<BridgeAccessCapability>;
  connected: Scalars["Boolean"]["output"];
  expiresAt?: Maybe<Scalars["DateTime"]["output"]>;
  hostingMode?: Maybe<HostingMode>;
  isOwner: Scalars["Boolean"]["output"];
  label?: Maybe<Scalars["String"]["output"]>;
  ownerUser?: Maybe<User>;
  pendingRequest?: Maybe<BridgeAccessRequest>;
  runtimeInstanceId: Scalars["ID"]["output"];
  scopeType?: Maybe<BridgeAccessScopeType>;
  sessionGroupId?: Maybe<Scalars["ID"]["output"]>;
};

export type Channel = {
  __typename?: "Channel";
  baseBranch?: Maybe<Scalars["String"]["output"]>;
  groupId?: Maybe<Scalars["ID"]["output"]>;
  id: Scalars["ID"]["output"];
  memberCount: Scalars["Int"]["output"];
  members: Array<ChannelMember>;
  messages: Array<Event>;
  name: Scalars["String"]["output"];
  owner?: Maybe<User>;
  position: Scalars["Int"]["output"];
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  runScripts?: Maybe<Scalars["JSON"]["output"]>;
  setupScript?: Maybe<Scalars["String"]["output"]>;
  type: ChannelType;
  viewerIsMember: Scalars["Boolean"]["output"];
  visibility: ChannelVisibility;
};

export type ChannelMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type ChannelGroup = {
  __typename?: "ChannelGroup";
  channels: Array<Channel>;
  id: Scalars["ID"]["output"];
  isCollapsed: Scalars["Boolean"]["output"];
  name: Scalars["String"]["output"];
  position: Scalars["Int"]["output"];
};

export type ChannelMember = {
  __typename?: "ChannelMember";
  joinedAt: Scalars["DateTime"]["output"];
  user: User;
};

export type ChannelType = "coding" | "text";

export type ChannelVisibility = "private" | "public";

export type Chat = {
  __typename?: "Chat";
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  id: Scalars["ID"]["output"];
  members: Array<ChatMember>;
  messages: Array<Message>;
  name?: Maybe<Scalars["String"]["output"]>;
  type: ChatType;
  updatedAt: Scalars["DateTime"]["output"];
};

export type ChatMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type ChatMember = {
  __typename?: "ChatMember";
  joinedAt: Scalars["DateTime"]["output"];
  user: User;
};

export type ChatType = "dm" | "group";

export type CodingTool =
  | "antigravity"
  | "claude_code"
  | "codex"
  | "cursor_composer"
  | "custom"
  | "pi";

export type CollapsedSessionEvents = {
  __typename?: "CollapsedSessionEvents";
  endEventId: Scalars["ID"]["output"];
  endTimestamp: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  startEventId: Scalars["ID"]["output"];
  startTimestamp: Scalars["DateTime"]["output"];
};

export type ConnectionsBridge = {
  __typename?: "ConnectionsBridge";
  bridge: BridgeRuntime;
  /** Whether the calling user has terminal capability on this bridge. */
  canTerminal: Scalars["Boolean"]["output"];
  repos: Array<ConnectionsRepoEntry>;
};

export type ConnectionsRepoEntry = {
  __typename?: "ConnectionsRepoEntry";
  /** Channel used to authorize terminal creation + source of runScripts. */
  channel: Channel;
  linkedCheckout?: Maybe<LinkedCheckoutStatus>;
  repo: Repo;
  runScripts?: Maybe<Scalars["JSON"]["output"]>;
};

export type CreateAgentEnvironmentInput = {
  adapterType: AgentEnvironmentAdapterType;
  config: Scalars["JSON"]["input"];
  enabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  isDefault?: InputMaybe<Scalars["Boolean"]["input"]>;
  name: Scalars["String"]["input"];
  orgId: Scalars["ID"]["input"];
};

export type CreateAiConversationInput = {
  title?: InputMaybe<Scalars["String"]["input"]>;
  visibility?: InputMaybe<AiConversationVisibility>;
};

export type CreateChannelGroupInput = {
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  position?: InputMaybe<Scalars["Int"]["input"]>;
};

export type CreateChannelInput = {
  baseBranch?: InputMaybe<Scalars["String"]["input"]>;
  groupId?: InputMaybe<Scalars["ID"]["input"]>;
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  position?: InputMaybe<Scalars["Int"]["input"]>;
  projectIds?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
  type?: InputMaybe<ChannelType>;
  visibility?: InputMaybe<ChannelVisibility>;
};

export type CreateChatInput = {
  memberIds: Array<Scalars["ID"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type CreateProjectInput = {
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type CreateRepoInput = {
  defaultBranch?: InputMaybe<Scalars["String"]["input"]>;
  name: Scalars["String"]["input"];
  organizationId: Scalars["ID"]["input"];
  remoteUrl?: InputMaybe<Scalars["String"]["input"]>;
};

export type CreateTicketInput = {
  assigneeIds?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  labels?: InputMaybe<Array<Scalars["String"]["input"]>>;
  organizationId: Scalars["ID"]["input"];
  priority?: InputMaybe<Priority>;
  projectId?: InputMaybe<Scalars["ID"]["input"]>;
  title: Scalars["String"]["input"];
};

export type DeliveryResult =
  | "delivered"
  | "delivery_failed"
  | "no_runtime"
  | "runtime_disconnected"
  | "session_unbound";

export type EndpointTrafficCaptureMode = "full" | "headers" | "metadata";

export type EndpointTrafficEntry = {
  __typename?: "EndpointTrafficEntry";
  completedAt?: Maybe<Scalars["DateTime"]["output"]>;
  durationMs?: Maybe<Scalars["Int"]["output"]>;
  endpointId: Scalars["ID"]["output"];
  error?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  requestBodyBytes?: Maybe<Scalars["Int"]["output"]>;
  requestBodyPreview?: Maybe<Scalars["String"]["output"]>;
  requestHeaders?: Maybe<Scalars["JSON"]["output"]>;
  requestMethod: Scalars["String"]["output"];
  requestPath: Scalars["String"]["output"];
  requestQuery?: Maybe<Scalars["String"]["output"]>;
  requestTruncated: Scalars["Boolean"]["output"];
  responseBodyBytes?: Maybe<Scalars["Int"]["output"]>;
  responseBodyPreview?: Maybe<Scalars["String"]["output"]>;
  responseHeaders?: Maybe<Scalars["JSON"]["output"]>;
  responseStatus?: Maybe<Scalars["Int"]["output"]>;
  responseTruncated: Scalars["Boolean"]["output"];
  startedAt: Scalars["DateTime"]["output"];
};

export type EntityType = "channel" | "chat" | "message" | "session" | "ticket";

export type Event = {
  __typename?: "Event";
  actor: Actor;
  eventType: EventType;
  id: Scalars["ID"]["output"];
  metadata?: Maybe<Scalars["JSON"]["output"]>;
  parentId?: Maybe<Scalars["ID"]["output"]>;
  payload: Scalars["JSON"]["output"];
  scopeId: Scalars["ID"]["output"];
  scopeType: ScopeType;
  timestamp: Scalars["DateTime"]["output"];
};

export type EventType =
  | "agent_environment_created"
  | "agent_environment_deleted"
  | "agent_environment_updated"
  | "application_config_updated"
  | "bridge_access_request_resolved"
  | "bridge_access_requested"
  | "bridge_access_revoked"
  | "bridge_access_updated"
  | "channel_created"
  | "channel_deleted"
  | "channel_group_created"
  | "channel_group_deleted"
  | "channel_group_updated"
  | "channel_member_added"
  | "channel_member_removed"
  | "channel_updated"
  | "chat_created"
  | "chat_member_added"
  | "chat_member_removed"
  | "chat_renamed"
  | "entity_linked"
  | "inbox_item_created"
  | "inbox_item_resolved"
  | "managed_git_token_minted"
  | "member_joined"
  | "member_left"
  | "message_deleted"
  | "message_edited"
  | "message_sent"
  | "organization_created"
  | "queued_message_added"
  | "queued_message_removed"
  | "queued_message_updated"
  | "queued_messages_cleared"
  | "queued_messages_drained"
  | "queued_messages_reordered"
  | "repo_created"
  | "repo_updated"
  | "session_application_log_appended"
  | "session_application_process_failed"
  | "session_application_process_started"
  | "session_application_process_stopped"
  | "session_application_workflow_completed"
  | "session_application_workflow_failed"
  | "session_application_workflow_started"
  | "session_application_workflow_updated"
  | "session_deleted"
  | "session_endpoint_access_updated"
  | "session_endpoint_created"
  | "session_endpoint_forwarding_disabled"
  | "session_endpoint_forwarding_enabled"
  | "session_endpoint_rotated"
  | "session_endpoint_traffic_capture_updated"
  | "session_group_archived"
  | "session_group_renamed"
  | "session_group_visibility_updated"
  | "session_output"
  | "session_paused"
  | "session_pr_closed"
  | "session_pr_merged"
  | "session_pr_opened"
  | "session_resumed"
  | "session_runtime_connected"
  | "session_runtime_connecting"
  | "session_runtime_deprovision_failed"
  | "session_runtime_disconnected"
  | "session_runtime_provisioning"
  | "session_runtime_reconnected"
  | "session_runtime_start_failed"
  | "session_runtime_start_requested"
  | "session_runtime_start_timed_out"
  | "session_runtime_stopped"
  | "session_runtime_stopping"
  | "session_setup_script_completed"
  | "session_setup_script_failed"
  | "session_setup_script_started"
  | "session_started"
  | "session_terminated"
  | "ticket_assigned"
  | "ticket_commented"
  | "ticket_created"
  | "ticket_linked"
  | "ticket_unassigned"
  | "ticket_unlinked"
  | "ticket_updated";

export type GitCheckpoint = {
  __typename?: "GitCheckpoint";
  author: Scalars["String"]["output"];
  captureContentType?: Maybe<Scalars["String"]["output"]>;
  captureStatus?: Maybe<GitCheckpointCaptureStatus>;
  captureUrl?: Maybe<Scalars["String"]["output"]>;
  capturedAt?: Maybe<Scalars["DateTime"]["output"]>;
  commitSha: Scalars["String"]["output"];
  committedAt: Scalars["DateTime"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  filesChanged: Scalars["Int"]["output"];
  id: Scalars["ID"]["output"];
  parentShas: Array<Scalars["String"]["output"]>;
  promptEvent?: Maybe<Event>;
  promptEventId: Scalars["ID"]["output"];
  repo?: Maybe<Repo>;
  repoId: Scalars["ID"]["output"];
  session?: Maybe<Session>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupId: Scalars["ID"]["output"];
  sessionId: Scalars["ID"]["output"];
  subject: Scalars["String"]["output"];
  treeSha: Scalars["String"]["output"];
};

export type GitCheckpointCaptureStatus = "captured" | "failed" | "pending" | "unavailable";

export type HostingMode = "cloud" | "local";

export type InboxItem = {
  __typename?: "InboxItem";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  itemType: InboxItemType;
  payload: Scalars["JSON"]["output"];
  resolvedAt?: Maybe<Scalars["DateTime"]["output"]>;
  sourceId: Scalars["ID"]["output"];
  sourceType: Scalars["String"]["output"];
  status: InboxItemStatus;
  summary?: Maybe<Scalars["String"]["output"]>;
  title: Scalars["String"]["output"];
  userId: Scalars["ID"]["output"];
};

export type InboxItemStatus = "active" | "dismissed" | "expired" | "resolved";

export type InboxItemType = "plan" | "question";

export type LinkedCheckoutActionResult = {
  __typename?: "LinkedCheckoutActionResult";
  error?: Maybe<Scalars["String"]["output"]>;
  errorCode?: Maybe<LinkedCheckoutErrorCode>;
  ok: Scalars["Boolean"]["output"];
  status: LinkedCheckoutStatus;
};

export type LinkedCheckoutChangedFile = {
  __typename?: "LinkedCheckoutChangedFile";
  additions: Scalars["Int"]["output"];
  contentTruncated: Scalars["Boolean"]["output"];
  deletions: Scalars["Int"]["output"];
  diff: Scalars["String"]["output"];
  modifiedContent: Scalars["String"]["output"];
  originalContent: Scalars["String"]["output"];
  path: Scalars["String"]["output"];
  status: Scalars["String"]["output"];
  truncated: Scalars["Boolean"]["output"];
};

export type LinkedCheckoutErrorCode = "DIRTY_ROOT_CHECKOUT";

export type LinkedCheckoutStatus = {
  __typename?: "LinkedCheckoutStatus";
  attachedSessionGroup?: Maybe<SessionGroup>;
  attachedSessionGroupId?: Maybe<Scalars["ID"]["output"]>;
  autoSyncEnabled: Scalars["Boolean"]["output"];
  changedFiles: Array<LinkedCheckoutChangedFile>;
  changedFilesTotalCount: Scalars["Int"]["output"];
  changedFilesTruncated: Scalars["Boolean"]["output"];
  currentBranch?: Maybe<Scalars["String"]["output"]>;
  currentCommitSha?: Maybe<Scalars["String"]["output"]>;
  hasUncommittedChanges: Scalars["Boolean"]["output"];
  isAttached: Scalars["Boolean"]["output"];
  lastSyncError?: Maybe<Scalars["String"]["output"]>;
  lastSyncedCommitSha?: Maybe<Scalars["String"]["output"]>;
  repo?: Maybe<Repo>;
  repoId: Scalars["ID"]["output"];
  repoPath?: Maybe<Scalars["String"]["output"]>;
  restoreBranch?: Maybe<Scalars["String"]["output"]>;
  restoreCommitSha?: Maybe<Scalars["String"]["output"]>;
  targetBranch?: Maybe<Scalars["String"]["output"]>;
};

export type LinkedCheckoutSyncConflictStrategy = "COMMIT" | "DISCARD" | "REBASE" | "STASH";

export type Message = {
  __typename?: "Message";
  actor: Actor;
  channelId?: Maybe<Scalars["ID"]["output"]>;
  chatId?: Maybe<Scalars["ID"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  deletedAt?: Maybe<Scalars["DateTime"]["output"]>;
  editedAt?: Maybe<Scalars["DateTime"]["output"]>;
  html?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  latestReplyAt?: Maybe<Scalars["DateTime"]["output"]>;
  mentions?: Maybe<Scalars["JSON"]["output"]>;
  parentMessageId?: Maybe<Scalars["ID"]["output"]>;
  replyCount: Scalars["Int"]["output"];
  text: Scalars["String"]["output"];
  threadRepliers: Array<Actor>;
  updatedAt: Scalars["DateTime"]["output"];
};

/**
 * A search hit spanning chat/channel messages and session conversation events.
 * Exactly one of chatId / channelId / sessionId identifies where the hit lives.
 */
export type MessageSearchHit = {
  __typename?: "MessageSearchHit";
  actor: Actor;
  channelId?: Maybe<Scalars["ID"]["output"]>;
  chatId?: Maybe<Scalars["ID"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  sessionGroupId?: Maybe<Scalars["ID"]["output"]>;
  sessionId?: Maybe<Scalars["ID"]["output"]>;
  text: Scalars["String"]["output"];
};

export type MoveChannelInput = {
  channelId: Scalars["ID"]["input"];
  groupId?: InputMaybe<Scalars["ID"]["input"]>;
  position: Scalars["Int"]["input"];
};

export type Mutation = {
  __typename?: "Mutation";
  addChannelMember: Channel;
  addChatMember: Chat;
  addOrgMember: OrgMember;
  approveBridgeAccessRequest: BridgeAccessGrant;
  archiveSessionGroup?: Maybe<SessionGroup>;
  assignTicket: Ticket;
  clearEndpointTraffic: Scalars["Boolean"]["output"];
  clearQueuedMessages: Scalars["Boolean"]["output"];
  commentOnTicket: Event;
  commitLinkedCheckoutChanges: LinkedCheckoutActionResult;
  commitSessionGroupFileChanges: Scalars["String"]["output"];
  createAgentEnvironment: AgentEnvironment;
  createAiConversation: AiConversation;
  createChannel: Channel;
  createChannelGroup: ChannelGroup;
  createChannelTerminal: Terminal;
  createChat: Chat;
  createProject: Project;
  createRepo: Repo;
  createSessionEndpointPreview: SessionEndpointPreview;
  createTerminal: Terminal;
  createTicket: Ticket;
  deleteAgentEnvironment: Scalars["Boolean"]["output"];
  deleteApiToken: Scalars["Boolean"]["output"];
  deleteChannel: Scalars["Boolean"]["output"];
  deleteChannelGroup: Scalars["Boolean"]["output"];
  deleteChannelMessage: Message;
  deleteChatMessage: Message;
  deleteOrgSecret: Scalars["Boolean"]["output"];
  deleteSession: Session;
  deleteSessionGroup: Scalars["Boolean"]["output"];
  denyBridgeAccessRequest: BridgeAccessRequest;
  destroyTerminal: Scalars["Boolean"]["output"];
  disableSessionEndpointForwarding: SessionEndpoint;
  dismissInboxItem: InboxItem;
  dismissSession: Session;
  editChannelMessage: Message;
  editChatMessage: Message;
  enableSessionEndpointForwarding: SessionEndpoint;
  forkSession: Session;
  /** Adopt an existing local worktree into a not-yet-started session's group (local hosting only). */
  importWorktree: SessionGroup;
  joinChannel: Channel;
  leaveChannel: Channel;
  leaveChat: Chat;
  linkEntityToProject: Project;
  linkLinkedCheckoutRepo: LinkedCheckoutActionResult;
  linkTicket: Ticket;
  moveChannel: Channel;
  moveSessionToCloud: Session;
  moveSessionToRuntime: Session;
  muteScope: Participant;
  publishAppSession: SessionEndpoint;
  queueSessionMessage: QueuedMessage;
  registerPushToken: Scalars["Boolean"]["output"];
  registerRepoWebhook: Repo;
  removeOrgMember: Scalars["Boolean"]["output"];
  removeQueuedMessage: Scalars["Boolean"]["output"];
  renameChat: Chat;
  renameSessionGroup: SessionGroup;
  reorderChannelGroups: Array<ChannelGroup>;
  reorderChannels: Array<Channel>;
  reorderQueuedMessages: Array<QueuedMessage>;
  requestBridgeAccess: BridgeAccessRequest;
  restartSessionProcess: SessionApplicationProcess;
  restoreLinkedCheckout: LinkedCheckoutActionResult;
  retrySessionConnection: Session;
  retrySessionGroupSetup: SessionGroup;
  revertSessionGroupFileChange: Scalars["Boolean"]["output"];
  revokeBridgeAccessGrant: BridgeAccessGrant;
  rotateSessionEndpoint: SessionEndpoint;
  runSession: Session;
  runSessionGroupSetupScript: Scalars["Boolean"]["output"];
  saveSessionGroupFile: Scalars["Boolean"]["output"];
  sendChannelMessage: Message;
  sendChatMessage: Message;
  sendMessage: Event;
  sendSessionMessage: Event;
  sendTurn: Turn;
  setApiToken: ApiTokenStatus;
  setLinkedCheckoutAutoSync: LinkedCheckoutActionResult;
  setOrgSecret: OrgSecret;
  startSession: Session;
  startSessionApplication: Array<SessionApplicationProcess>;
  startSessionApplicationWorkflow: SessionApplicationWorkflowRun;
  startSessionProcess: SessionApplicationProcess;
  steerQueuedMessage: Event;
  stopSessionApplication: Array<SessionApplicationProcess>;
  stopSessionProcess: SessionApplicationProcess;
  subscribe: Participant;
  syncLinkedCheckout: LinkedCheckoutActionResult;
  terminateSession: Session;
  testAgentEnvironment: AgentEnvironmentTestResult;
  unassignTicket: Ticket;
  unlinkTicket: Ticket;
  unmuteScope: Participant;
  unregisterPushToken: Scalars["Boolean"]["output"];
  unregisterRepoWebhook: Repo;
  unsubscribe: Scalars["Boolean"]["output"];
  updateAgentEnvironment: AgentEnvironment;
  updateAiConversationTitle: AiConversation;
  updateBridgeAccessGrant: BridgeAccessGrant;
  updateChannel: Channel;
  updateChannelGroup: ChannelGroup;
  updateOrgMemberRole: OrgMember;
  updateQueuedMessage: QueuedMessage;
  updateRepo: Repo;
  updateSessionConfig: Session;
  updateSessionDefaults: User;
  updateSessionEndpointTrafficCapture: SessionEndpoint;
  updateSessionGroupVisibility: SessionGroup;
  updateTicket: Ticket;
};

export type MutationAddChannelMemberArgs = {
  input: AddChannelMemberInput;
};

export type MutationAddChatMemberArgs = {
  input: AddChatMemberInput;
};

export type MutationAddOrgMemberArgs = {
  organizationId: Scalars["ID"]["input"];
  role?: InputMaybe<UserRole>;
  userId: Scalars["ID"]["input"];
};

export type MutationApproveBridgeAccessRequestArgs = {
  capabilities?: InputMaybe<Array<BridgeAccessCapability>>;
  expiresAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  requestId: Scalars["ID"]["input"];
  scopeType?: InputMaybe<BridgeAccessScopeType>;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type MutationArchiveSessionGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationAssignTicketArgs = {
  ticketId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type MutationClearEndpointTrafficArgs = {
  endpointId: Scalars["ID"]["input"];
};

export type MutationClearQueuedMessagesArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type MutationCommentOnTicketArgs = {
  text: Scalars["String"]["input"];
  ticketId: Scalars["ID"]["input"];
};

export type MutationCommitLinkedCheckoutChangesArgs = {
  message?: InputMaybe<Scalars["String"]["input"]>;
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationCommitSessionGroupFileChangesArgs = {
  message?: InputMaybe<Scalars["String"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationCreateAgentEnvironmentArgs = {
  input: CreateAgentEnvironmentInput;
};

export type MutationCreateAiConversationArgs = {
  input: CreateAiConversationInput;
  organizationId: Scalars["ID"]["input"];
};

export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
};

export type MutationCreateChannelGroupArgs = {
  input: CreateChannelGroupInput;
};

export type MutationCreateChannelTerminalArgs = {
  bridgeRuntimeId: Scalars["ID"]["input"];
  channelId: Scalars["ID"]["input"];
  cols: Scalars["Int"]["input"];
  rows: Scalars["Int"]["input"];
};

export type MutationCreateChatArgs = {
  input: CreateChatInput;
};

export type MutationCreateProjectArgs = {
  input: CreateProjectInput;
};

export type MutationCreateRepoArgs = {
  input: CreateRepoInput;
};

export type MutationCreateSessionEndpointPreviewArgs = {
  endpointId: Scalars["ID"]["input"];
};

export type MutationCreateTerminalArgs = {
  cols: Scalars["Int"]["input"];
  rows: Scalars["Int"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type MutationCreateTicketArgs = {
  input: CreateTicketInput;
};

export type MutationDeleteAgentEnvironmentArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteApiTokenArgs = {
  provider: ApiTokenProvider;
};

export type MutationDeleteChannelArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteChannelGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteChannelMessageArgs = {
  messageId: Scalars["ID"]["input"];
};

export type MutationDeleteChatMessageArgs = {
  messageId: Scalars["ID"]["input"];
};

export type MutationDeleteOrgSecretArgs = {
  id: Scalars["ID"]["input"];
  orgId: Scalars["ID"]["input"];
};

export type MutationDeleteSessionArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDeleteSessionGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDenyBridgeAccessRequestArgs = {
  requestId: Scalars["ID"]["input"];
};

export type MutationDestroyTerminalArgs = {
  terminalId: Scalars["ID"]["input"];
};

export type MutationDisableSessionEndpointForwardingArgs = {
  endpointId: Scalars["ID"]["input"];
};

export type MutationDismissInboxItemArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationDismissSessionArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationEditChannelMessageArgs = {
  html: Scalars["String"]["input"];
  messageId: Scalars["ID"]["input"];
};

export type MutationEditChatMessageArgs = {
  html: Scalars["String"]["input"];
  messageId: Scalars["ID"]["input"];
};

export type MutationEnableSessionEndpointForwardingArgs = {
  accessMode?: InputMaybe<SessionEndpointAccessMode>;
  endpointId: Scalars["ID"]["input"];
};

export type MutationForkSessionArgs = {
  eventId: Scalars["ID"]["input"];
};

export type MutationImportWorktreeArgs = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  sessionId: Scalars["ID"]["input"];
  worktreePath: Scalars["String"]["input"];
};

export type MutationJoinChannelArgs = {
  channelId: Scalars["ID"]["input"];
};

export type MutationLeaveChannelArgs = {
  channelId: Scalars["ID"]["input"];
};

export type MutationLeaveChatArgs = {
  chatId: Scalars["ID"]["input"];
};

export type MutationLinkEntityToProjectArgs = {
  entityId: Scalars["ID"]["input"];
  entityType: EntityType;
  projectId: Scalars["ID"]["input"];
};

export type MutationLinkLinkedCheckoutRepoArgs = {
  localPath: Scalars["String"]["input"];
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationLinkTicketArgs = {
  entityId: Scalars["ID"]["input"];
  entityType: EntityType;
  ticketId: Scalars["ID"]["input"];
};

export type MutationMoveChannelArgs = {
  input: MoveChannelInput;
};

export type MutationMoveSessionToCloudArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type MutationMoveSessionToRuntimeArgs = {
  runtimeInstanceId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type MutationMuteScopeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationPublishAppSessionArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationQueueSessionMessageArgs = {
  attachmentKeys?: InputMaybe<Array<Scalars["String"]["input"]>>;
  imageKeys?: InputMaybe<Array<Scalars["String"]["input"]>>;
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  sessionId: Scalars["ID"]["input"];
  text: Scalars["String"]["input"];
};

export type MutationRegisterPushTokenArgs = {
  platform: PushPlatform;
  token: Scalars["String"]["input"];
};

export type MutationRegisterRepoWebhookArgs = {
  repoId: Scalars["ID"]["input"];
};

export type MutationRemoveOrgMemberArgs = {
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type MutationRemoveQueuedMessageArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationRenameChatArgs = {
  chatId: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
};

export type MutationRenameSessionGroupArgs = {
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
};

export type MutationReorderChannelGroupsArgs = {
  input: ReorderChannelGroupsInput;
};

export type MutationReorderChannelsArgs = {
  input: ReorderChannelsInput;
};

export type MutationReorderQueuedMessagesArgs = {
  ids: Array<Scalars["ID"]["input"]>;
  sessionId: Scalars["ID"]["input"];
};

export type MutationRequestBridgeAccessArgs = {
  requestedCapabilities?: InputMaybe<Array<BridgeAccessCapability>>;
  requestedExpiresAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  runtimeInstanceId: Scalars["ID"]["input"];
  scopeType: BridgeAccessScopeType;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type MutationRestartSessionProcessArgs = {
  appConfigId: Scalars["ID"]["input"];
  processConfigId: Scalars["ID"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationRestoreLinkedCheckoutArgs = {
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationRetrySessionConnectionArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type MutationRetrySessionGroupSetupArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationRevertSessionGroupFileChangeArgs = {
  filePath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationRevokeBridgeAccessGrantArgs = {
  grantId: Scalars["ID"]["input"];
};

export type MutationRotateSessionEndpointArgs = {
  endpointId: Scalars["ID"]["input"];
};

export type MutationRunSessionArgs = {
  id: Scalars["ID"]["input"];
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  prompt?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationRunSessionGroupSetupScriptArgs = {
  scriptId: Scalars["ID"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationSaveSessionGroupFileArgs = {
  content: Scalars["String"]["input"];
  filePath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationSendChannelMessageArgs = {
  channelId: Scalars["ID"]["input"];
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  text?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationSendChatMessageArgs = {
  chatId: Scalars["ID"]["input"];
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  text?: InputMaybe<Scalars["String"]["input"]>;
};

export type MutationSendMessageArgs = {
  channelId: Scalars["ID"]["input"];
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  text: Scalars["String"]["input"];
};

export type MutationSendSessionMessageArgs = {
  attachmentKeys?: InputMaybe<Array<Scalars["String"]["input"]>>;
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  imageKeys?: InputMaybe<Array<Scalars["String"]["input"]>>;
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  sessionId: Scalars["ID"]["input"];
  text: Scalars["String"]["input"];
};

export type MutationSendTurnArgs = {
  branchId: Scalars["ID"]["input"];
  content: Scalars["String"]["input"];
};

export type MutationSetApiTokenArgs = {
  input: SetApiTokenInput;
};

export type MutationSetLinkedCheckoutAutoSyncArgs = {
  enabled: Scalars["Boolean"]["input"];
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationSetOrgSecretArgs = {
  input: SetOrgSecretInput;
};

export type MutationStartSessionArgs = {
  input: StartSessionInput;
};

export type MutationStartSessionApplicationArgs = {
  appConfigId: Scalars["ID"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationStartSessionApplicationWorkflowArgs = {
  appConfigId: Scalars["ID"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationStartSessionProcessArgs = {
  appConfigId: Scalars["ID"]["input"];
  processConfigId: Scalars["ID"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationSteerQueuedMessageArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationStopSessionApplicationArgs = {
  appConfigId: Scalars["ID"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationStopSessionProcessArgs = {
  appConfigId: Scalars["ID"]["input"];
  processConfigId: Scalars["ID"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationSubscribeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationSyncLinkedCheckoutArgs = {
  autoSyncEnabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  branch: Scalars["String"]["input"];
  commitMessage?: InputMaybe<Scalars["String"]["input"]>;
  commitSha?: InputMaybe<Scalars["String"]["input"]>;
  conflictStrategy?: InputMaybe<LinkedCheckoutSyncConflictStrategy>;
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationTerminateSessionArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationTestAgentEnvironmentArgs = {
  id: Scalars["ID"]["input"];
};

export type MutationUnassignTicketArgs = {
  ticketId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
};

export type MutationUnlinkTicketArgs = {
  entityId: Scalars["ID"]["input"];
  entityType: EntityType;
  ticketId: Scalars["ID"]["input"];
};

export type MutationUnmuteScopeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationUnregisterPushTokenArgs = {
  token: Scalars["String"]["input"];
};

export type MutationUnregisterRepoWebhookArgs = {
  repoId: Scalars["ID"]["input"];
};

export type MutationUnsubscribeArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type MutationUpdateAgentEnvironmentArgs = {
  input: UpdateAgentEnvironmentInput;
};

export type MutationUpdateAiConversationTitleArgs = {
  conversationId: Scalars["ID"]["input"];
  title: Scalars["String"]["input"];
};

export type MutationUpdateBridgeAccessGrantArgs = {
  capabilities: Array<BridgeAccessCapability>;
  grantId: Scalars["ID"]["input"];
};

export type MutationUpdateChannelArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateChannelInput;
};

export type MutationUpdateChannelGroupArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateChannelGroupInput;
};

export type MutationUpdateOrgMemberRoleArgs = {
  organizationId: Scalars["ID"]["input"];
  role: UserRole;
  userId: Scalars["ID"]["input"];
};

export type MutationUpdateQueuedMessageArgs = {
  id: Scalars["ID"]["input"];
  text: Scalars["String"]["input"];
};

export type MutationUpdateRepoArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateRepoInput;
};

export type MutationUpdateSessionConfigArgs = {
  hosting?: InputMaybe<HostingMode>;
  model?: InputMaybe<Scalars["String"]["input"]>;
  reasoningEffort?: InputMaybe<Scalars["String"]["input"]>;
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionId: Scalars["ID"]["input"];
  tool?: InputMaybe<CodingTool>;
};

export type MutationUpdateSessionDefaultsArgs = {
  input: UpdateSessionDefaultsInput;
};

export type MutationUpdateSessionEndpointTrafficCaptureArgs = {
  endpointId: Scalars["ID"]["input"];
  mode: EndpointTrafficCaptureMode;
};

export type MutationUpdateSessionGroupVisibilityArgs = {
  id: Scalars["ID"]["input"];
  visibility: SessionGroupVisibility;
};

export type MutationUpdateTicketArgs = {
  id: Scalars["ID"]["input"];
  input: UpdateTicketInput;
};

export type Notification = {
  __typename?: "Notification";
  id: Scalars["ID"]["output"];
  message: Scalars["String"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type OrgMember = {
  __typename?: "OrgMember";
  joinedAt: Scalars["DateTime"]["output"];
  organization: Organization;
  role: UserRole;
  user: User;
};

export type OrgSecret = {
  __typename?: "OrgSecret";
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  orgId: Scalars["ID"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type Organization = {
  __typename?: "Organization";
  agentEnvironments: Array<AgentEnvironment>;
  channels: Array<Channel>;
  id: Scalars["ID"]["output"];
  members: Array<OrgMember>;
  name: Scalars["String"]["output"];
  projects: Array<Project>;
  repos: Array<Repo>;
};

export type Participant = {
  __typename?: "Participant";
  muted: Scalars["Boolean"]["output"];
  scopeId: Scalars["ID"]["output"];
  scopeType: Scalars["String"]["output"];
  subscribedAt: Scalars["DateTime"]["output"];
  user: User;
  userId: Scalars["ID"]["output"];
};

export type PortEndpoint = {
  __typename?: "PortEndpoint";
  label: Scalars["String"]["output"];
  port: Scalars["Int"]["output"];
  status: Scalars["String"]["output"];
  url: Scalars["String"]["output"];
};

export type Priority = "high" | "low" | "medium" | "urgent";

export type Project = {
  __typename?: "Project";
  channels: Array<Channel>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  repo?: Maybe<Repo>;
  sessions: Array<Session>;
  tickets: Array<Ticket>;
};

export type PushPlatform = "android" | "ios";

export type Query = {
  __typename?: "Query";
  agentEnvironments: Array<AgentEnvironment>;
  aiConversation?: Maybe<AiConversation>;
  aiConversations: Array<AiConversation>;
  /**
   * App-kind session groups for the org. Apps have no channel, so this is their
   * listing surface (the sidebar Apps section).
   */
  appSessionGroups: Array<SessionGroup>;
  availableRuntimes: Array<SessionRuntimeInstance>;
  availableSessionRuntimes: Array<SessionRuntimeInstance>;
  branch?: Maybe<Branch>;
  bridgeRuntimeAccess: BridgeRuntimeAccess;
  channel?: Maybe<Channel>;
  channelGroups: Array<ChannelGroup>;
  channelMessages: Array<Message>;
  channelTerminals: Array<Terminal>;
  channels: Array<Channel>;
  chat?: Maybe<Chat>;
  chatMessages: Array<Message>;
  chats: Array<Chat>;
  endpointTraffic: Array<EndpointTrafficEntry>;
  events: Array<Event>;
  inboxItems: Array<InboxItem>;
  linkedCheckoutChangedFile: LinkedCheckoutChangedFile;
  linkedCheckoutStatus: LinkedCheckoutStatus;
  myApiTokens: Array<ApiTokenStatus>;
  myBridgeRuntimes: Array<BridgeRuntime>;
  myConnections: Array<ConnectionsBridge>;
  myOrganizations: Array<OrgMember>;
  mySessions: Array<Session>;
  orgSecrets: Array<OrgSecret>;
  organization?: Maybe<Organization>;
  participants: Array<Participant>;
  project?: Maybe<Project>;
  projects: Array<Project>;
  repo?: Maybe<Repo>;
  repoBranches: Array<Scalars["String"]["output"]>;
  /** Existing on-disk worktrees of a repo on a local runtime, available to import. */
  repoWorktrees: Array<RepoWorktree>;
  repos: Array<Repo>;
  searchMessages: Array<MessageSearchHit>;
  searchSessions: SessionSearchResults;
  searchUsers: Array<User>;
  session?: Maybe<Session>;
  sessionApplicationLogs: Array<SessionApplicationLogEntry>;
  sessionApplicationProcesses: Array<SessionApplicationProcess>;
  sessionApplicationWorkflowRuns: Array<SessionApplicationWorkflowRun>;
  sessionEndpoints: Array<SessionEndpoint>;
  sessionEventsAroundEvent: Array<Event>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupBranchDiff: Array<BranchDiffFile>;
  sessionGroupDirectoryEntries: Array<SessionGroupDirectoryEntry>;
  sessionGroupFileAtRef: Scalars["String"]["output"];
  sessionGroupFileContent: Scalars["String"]["output"];
  sessionGroupFileContentWithSource: SessionGroupFileContentResult;
  sessionGroupFileTree: SessionGroupFileTree;
  sessionGroupFiles: Array<Scalars["String"]["output"]>;
  sessionGroupWorktreeChanges: WorktreeChangesResult;
  sessionGroups: Array<SessionGroup>;
  sessionPromptIndex: Array<SessionPromptIndexItem>;
  sessionSetupScriptRuns: Array<SessionSetupScriptRun>;
  sessionSlashCommands: Array<SlashCommand>;
  sessionTerminals: Array<Terminal>;
  sessionTimeline: SessionTimelinePage;
  sessions: Array<Session>;
  threadReplies: Array<Message>;
  threadSummary?: Maybe<ThreadSummary>;
  ticket?: Maybe<Ticket>;
  tickets: Array<Ticket>;
};

export type QueryAgentEnvironmentsArgs = {
  orgId: Scalars["ID"]["input"];
};

export type QueryAiConversationArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryAiConversationsArgs = {
  organizationId: Scalars["ID"]["input"];
  visibility?: InputMaybe<AiConversationVisibility>;
};

export type QueryAppSessionGroupsArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryAvailableRuntimesArgs = {
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
  tool: CodingTool;
};

export type QueryAvailableSessionRuntimesArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type QueryBranchArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryBridgeRuntimeAccessArgs = {
  runtimeInstanceId: Scalars["ID"]["input"];
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryChannelArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryChannelGroupsArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryChannelMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  channelId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryChannelTerminalsArgs = {
  bridgeRuntimeId: Scalars["ID"]["input"];
  channelId: Scalars["ID"]["input"];
};

export type QueryChannelsArgs = {
  memberOnly?: InputMaybe<Scalars["Boolean"]["input"]>;
  organizationId: Scalars["ID"]["input"];
  projectId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryChatArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryChatMessagesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  chatId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryEndpointTrafficArgs = {
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  endpointId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
};

export type QueryEventsArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  afterEventId?: InputMaybe<Scalars["ID"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  beforeEventId?: InputMaybe<Scalars["ID"]["input"]>;
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]>>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  organizationId: Scalars["ID"]["input"];
  scope?: InputMaybe<ScopeInput>;
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type QueryInboxItemsArgs = {
  organizationId: Scalars["ID"]["input"];
  status?: InputMaybe<InboxItemStatus>;
};

export type QueryLinkedCheckoutChangedFileArgs = {
  filePath: Scalars["String"]["input"];
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type QueryLinkedCheckoutStatusArgs = {
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId: Scalars["ID"]["input"];
};

export type QueryMySessionsArgs = {
  agentStatus?: InputMaybe<AgentStatus>;
  includeArchived?: InputMaybe<Scalars["Boolean"]["input"]>;
  includeMerged?: InputMaybe<Scalars["Boolean"]["input"]>;
  organizationId: Scalars["ID"]["input"];
};

export type QueryOrgSecretsArgs = {
  orgId: Scalars["ID"]["input"];
};

export type QueryOrganizationArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryParticipantsArgs = {
  scopeId: Scalars["ID"]["input"];
  scopeType: Scalars["String"]["input"];
};

export type QueryProjectArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryProjectsArgs = {
  organizationId: Scalars["ID"]["input"];
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryRepoArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryRepoBranchesArgs = {
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryRepoWorktreesArgs = {
  repoId: Scalars["ID"]["input"];
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type QueryReposArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QuerySearchMessagesArgs = {
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  query: Scalars["String"]["input"];
};

export type QuerySearchSessionsArgs = {
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  query: Scalars["String"]["input"];
};

export type QuerySearchUsersArgs = {
  query: Scalars["String"]["input"];
};

export type QuerySessionArgs = {
  id: Scalars["ID"]["input"];
};

export type QuerySessionApplicationLogsArgs = {
  beforeSequence?: InputMaybe<Scalars["Int"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  processId: Scalars["ID"]["input"];
};

export type QuerySessionApplicationProcessesArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionApplicationWorkflowRunsArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionEndpointsArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionEventsAroundEventArgs = {
  eventId: Scalars["ID"]["input"];
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]>>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type QuerySessionGroupArgs = {
  id: Scalars["ID"]["input"];
};

export type QuerySessionGroupBranchDiffArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupDirectoryEntriesArgs = {
  depth?: InputMaybe<Scalars["Int"]["input"]>;
  directoryPath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFileAtRefArgs = {
  filePath: Scalars["String"]["input"];
  ref: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFileContentArgs = {
  filePath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFileContentWithSourceArgs = {
  filePath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFileTreeArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupFilesArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupWorktreeChangesArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionGroupsArgs = {
  archived?: InputMaybe<Scalars["Boolean"]["input"]>;
  channelId: Scalars["ID"]["input"];
  includeActiveMerged?: InputMaybe<Scalars["Boolean"]["input"]>;
  status?: InputMaybe<SessionGroupStatus>;
};

export type QuerySessionPromptIndexArgs = {
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type QuerySessionSetupScriptRunsArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QuerySessionSlashCommandsArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type QuerySessionTerminalsArgs = {
  sessionId: Scalars["ID"]["input"];
};

export type QuerySessionTimelineArgs = {
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  beforeEventId?: InputMaybe<Scalars["ID"]["input"]>;
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]>>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type QuerySessionsArgs = {
  filters?: InputMaybe<SessionFilters>;
  organizationId: Scalars["ID"]["input"];
};

export type QueryThreadRepliesArgs = {
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  rootMessageId: Scalars["ID"]["input"];
};

export type QueryThreadSummaryArgs = {
  rootMessageId: Scalars["ID"]["input"];
};

export type QueryTicketArgs = {
  id: Scalars["ID"]["input"];
};

export type QueryTicketsArgs = {
  filters?: InputMaybe<TicketFilters>;
  organizationId: Scalars["ID"]["input"];
};

export type QueuedMessage = {
  __typename?: "QueuedMessage";
  attachmentKeys: Array<Scalars["String"]["output"]>;
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  imageKeys: Array<Scalars["String"]["output"]>;
  interactionMode?: Maybe<Scalars["String"]["output"]>;
  position: Scalars["Int"]["output"];
  sessionId: Scalars["ID"]["output"];
  text: Scalars["String"]["output"];
};

export type ReorderChannelGroupsInput = {
  groupIds: Array<Scalars["ID"]["input"]>;
  organizationId: Scalars["ID"]["input"];
};

export type ReorderChannelsInput = {
  channelIds: Array<Scalars["ID"]["input"]>;
  groupId?: InputMaybe<Scalars["ID"]["input"]>;
};

export type Repo = {
  __typename?: "Repo";
  applicationConfig: RepoApplicationConfig;
  defaultBranch: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  projects: Array<Project>;
  provider: RepoProvider;
  remoteUrl?: Maybe<Scalars["String"]["output"]>;
  runtimeProfile?: Maybe<Scalars["String"]["output"]>;
  sessions: Array<Session>;
  webhookActive: Scalars["Boolean"]["output"];
};

export type RepoApplicationConfig = {
  __typename?: "RepoApplicationConfig";
  applications: Array<RepoApplicationDefinition>;
  setupScripts: Array<RepoSetupScript>;
};

export type RepoApplicationConfigInput = {
  applications?: InputMaybe<Array<RepoApplicationDefinitionInput>>;
  setupScripts?: InputMaybe<Array<RepoSetupScriptInput>>;
};

export type RepoApplicationDefinition = {
  __typename?: "RepoApplicationDefinition";
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  processes: Array<RepoProcessDefinition>;
};

export type RepoApplicationDefinitionInput = {
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
  processes: Array<RepoProcessDefinitionInput>;
};

export type RepoEnvVar = {
  __typename?: "RepoEnvVar";
  key: Scalars["String"]["output"];
  secretName: Scalars["String"]["output"];
};

export type RepoEnvVarInput = {
  key: Scalars["String"]["input"];
  secretName: Scalars["String"]["input"];
};

export type RepoPortDefinition = {
  __typename?: "RepoPortDefinition";
  defaultForwardingEnabled: Scalars["Boolean"]["output"];
  healthPath?: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  label: Scalars["String"]["output"];
  port: Scalars["Int"]["output"];
  protocol: Scalars["String"]["output"];
};

export type RepoPortDefinitionInput = {
  defaultForwardingEnabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  healthPath?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
  label: Scalars["String"]["input"];
  port: Scalars["Int"]["input"];
  protocol?: InputMaybe<Scalars["String"]["input"]>;
};

export type RepoProcessDefinition = {
  __typename?: "RepoProcessDefinition";
  command: Scalars["String"]["output"];
  dependsOn: Array<Scalars["String"]["output"]>;
  env: Array<RepoEnvVar>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  ports: Array<RepoPortDefinition>;
  required: Scalars["Boolean"]["output"];
  workingDirectory?: Maybe<Scalars["String"]["output"]>;
};

export type RepoProcessDefinitionInput = {
  command: Scalars["String"]["input"];
  dependsOn?: InputMaybe<Array<Scalars["String"]["input"]>>;
  env?: InputMaybe<Array<RepoEnvVarInput>>;
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
  ports?: InputMaybe<Array<RepoPortDefinitionInput>>;
  required?: InputMaybe<Scalars["Boolean"]["input"]>;
  workingDirectory?: InputMaybe<Scalars["String"]["input"]>;
};

export type RepoProvider = "github" | "managed";

export type RepoSetupScript = {
  __typename?: "RepoSetupScript";
  command: Scalars["String"]["output"];
  dependsOn: Array<Scalars["String"]["output"]>;
  env: Array<RepoEnvVar>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  workingDirectory?: Maybe<Scalars["String"]["output"]>;
};

export type RepoSetupScriptInput = {
  command: Scalars["String"]["input"];
  dependsOn?: InputMaybe<Array<Scalars["String"]["input"]>>;
  env?: InputMaybe<Array<RepoEnvVarInput>>;
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
  workingDirectory?: InputMaybe<Scalars["String"]["input"]>;
};

/** An existing git worktree of a repo on a local runtime, offered for import. */
export type RepoWorktree = {
  __typename?: "RepoWorktree";
  branch?: Maybe<Scalars["String"]["output"]>;
  head?: Maybe<Scalars["String"]["output"]>;
  isMain: Scalars["Boolean"]["output"];
  /** True when the worktree is already managed by Trace (not a candidate for import). */
  isTraceManaged: Scalars["Boolean"]["output"];
  path: Scalars["String"]["output"];
};

export type ScopeInput = {
  id: Scalars["ID"]["input"];
  type: ScopeType;
};

export type ScopeType = "channel" | "chat" | "session" | "system" | "ticket";

export type Session = {
  __typename?: "Session";
  agentStatus: AgentStatus;
  branch?: Maybe<Scalars["String"]["output"]>;
  cacheCreationTokens: Scalars["Float"]["output"];
  cacheReadTokens: Scalars["Float"]["output"];
  channel?: Maybe<Channel>;
  connection?: Maybe<SessionConnection>;
  costUsd: Scalars["Float"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  endpoints?: Maybe<SessionEndpoints>;
  gitCheckpoints: Array<GitCheckpoint>;
  hosting: HostingMode;
  id: Scalars["ID"]["output"];
  inputTokens: Scalars["Float"]["output"];
  lastMessageAt?: Maybe<Scalars["DateTime"]["output"]>;
  lastUserMessageAt?: Maybe<Scalars["DateTime"]["output"]>;
  model?: Maybe<Scalars["String"]["output"]>;
  name: Scalars["String"]["output"];
  outputTokens: Scalars["Float"]["output"];
  prUrl?: Maybe<Scalars["String"]["output"]>;
  projects: Array<Project>;
  queuedMessages: Array<QueuedMessage>;
  reasoningEffort?: Maybe<Scalars["String"]["output"]>;
  repo?: Maybe<Repo>;
  sessionGroup?: Maybe<SessionGroup>;
  sessionGroupId?: Maybe<Scalars["ID"]["output"]>;
  sessionStatus: SessionStatus;
  tickets: Array<Ticket>;
  tool: CodingTool;
  toolSessionId?: Maybe<Scalars["String"]["output"]>;
  updatedAt: Scalars["DateTime"]["output"];
  workdir?: Maybe<Scalars["String"]["output"]>;
  worktreeDeleted: Scalars["Boolean"]["output"];
};

export type SessionApplicationLogEntry = {
  __typename?: "SessionApplicationLogEntry";
  data: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  processId: Scalars["ID"]["output"];
  sequence: Scalars["Int"]["output"];
  stream: Scalars["String"]["output"];
  timestamp: Scalars["DateTime"]["output"];
};

export type SessionApplicationProcess = {
  __typename?: "SessionApplicationProcess";
  appConfigId: Scalars["String"]["output"];
  endpoints: Array<SessionEndpoint>;
  exitCode?: Maybe<Scalars["Int"]["output"]>;
  id: Scalars["ID"]["output"];
  label: Scalars["String"]["output"];
  lastError?: Maybe<Scalars["String"]["output"]>;
  processConfigId: Scalars["String"]["output"];
  runtimeInstanceId?: Maybe<Scalars["String"]["output"]>;
  sessionGroupId: Scalars["ID"]["output"];
  startedAt?: Maybe<Scalars["DateTime"]["output"]>;
  status: ApplicationProcessStatus;
  stoppedAt?: Maybe<Scalars["DateTime"]["output"]>;
};

export type SessionApplicationWorkflowRun = {
  __typename?: "SessionApplicationWorkflowRun";
  appConfigId: Scalars["String"]["output"];
  completedAt?: Maybe<Scalars["DateTime"]["output"]>;
  id: Scalars["ID"]["output"];
  lastError?: Maybe<Scalars["String"]["output"]>;
  sessionGroupId: Scalars["ID"]["output"];
  startedAt: Scalars["DateTime"]["output"];
  status: WorkflowRunStatus;
  steps: Array<SessionApplicationWorkflowStep>;
};

export type SessionApplicationWorkflowStep = {
  __typename?: "SessionApplicationWorkflowStep";
  dependsOn: Array<Scalars["String"]["output"]>;
  kind: WorkflowStepKind;
  label: Scalars["String"]["output"];
  optional: Scalars["Boolean"]["output"];
  status: WorkflowStepStatus;
  stepId: Scalars["String"]["output"];
};

export type SessionConnection = {
  __typename?: "SessionConnection";
  adapterType?: Maybe<Scalars["String"]["output"]>;
  /**
   * When false, the frontend should not auto-retry the connection — only manual
   * Retry/Move can unblock. Used for non-transient failures like the home bridge
   * being offline, where repeated retries produce noise without progress.
   */
  autoRetryable?: Maybe<Scalars["Boolean"]["output"]>;
  canMove: Scalars["Boolean"]["output"];
  canRetry: Scalars["Boolean"]["output"];
  connectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  connectingAt?: Maybe<Scalars["DateTime"]["output"]>;
  disconnectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  environmentId?: Maybe<Scalars["String"]["output"]>;
  failedAt?: Maybe<Scalars["DateTime"]["output"]>;
  lastDeliveryFailureAt?: Maybe<Scalars["DateTime"]["output"]>;
  lastError?: Maybe<Scalars["String"]["output"]>;
  lastSeen?: Maybe<Scalars["DateTime"]["output"]>;
  providerRuntimeId?: Maybe<Scalars["String"]["output"]>;
  providerRuntimeUrl?: Maybe<Scalars["String"]["output"]>;
  provisioningAt?: Maybe<Scalars["DateTime"]["output"]>;
  reconnectedAt?: Maybe<Scalars["DateTime"]["output"]>;
  requestedAt?: Maybe<Scalars["DateTime"]["output"]>;
  retryCount: Scalars["Int"]["output"];
  runtimeInstanceId?: Maybe<Scalars["String"]["output"]>;
  runtimeLabel?: Maybe<Scalars["String"]["output"]>;
  state: SessionConnectionState;
  stoppedAt?: Maybe<Scalars["DateTime"]["output"]>;
  stoppingAt?: Maybe<Scalars["DateTime"]["output"]>;
  timedOutAt?: Maybe<Scalars["DateTime"]["output"]>;
};

export type SessionConnectionState =
  | "booting"
  | "connected"
  | "connecting"
  | "degraded"
  | "deprovision_failed"
  | "deprovisioned"
  | "disconnected"
  | "failed"
  | "pending"
  | "provisioning"
  | "requested"
  | "stopped"
  | "stopping"
  | "timed_out";

export type SessionEndpoint = {
  __typename?: "SessionEndpoint";
  accessMode: SessionEndpointAccessMode;
  appConfigId: Scalars["String"]["output"];
  disabledAt?: Maybe<Scalars["DateTime"]["output"]>;
  enabledAt?: Maybe<Scalars["DateTime"]["output"]>;
  id: Scalars["ID"]["output"];
  key: Scalars["String"]["output"];
  label: Scalars["String"]["output"];
  portConfigId: Scalars["String"]["output"];
  processConfigId: Scalars["String"]["output"];
  revokedAt?: Maybe<Scalars["DateTime"]["output"]>;
  sessionGroupId: Scalars["ID"]["output"];
  status: SessionEndpointStatus;
  targetPort: Scalars["Int"]["output"];
  trafficCaptureMode: EndpointTrafficCaptureMode;
  url: Scalars["String"]["output"];
};

export type SessionEndpointAccessMode = "private" | "public";

export type SessionEndpointPreview = {
  __typename?: "SessionEndpointPreview";
  expiresAt: Scalars["DateTime"]["output"];
  url: Scalars["String"]["output"];
};

export type SessionEndpointStatus = "disabled" | "enabled" | "revoked" | "unavailable";

export type SessionEndpoints = {
  __typename?: "SessionEndpoints";
  ports: Array<PortEndpoint>;
  terminals: Array<TerminalEndpoint>;
};

export type SessionFilters = {
  agentStatus?: InputMaybe<AgentStatus>;
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  includeArchived?: InputMaybe<Scalars["Boolean"]["input"]>;
  includeMerged?: InputMaybe<Scalars["Boolean"]["input"]>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
  tool?: InputMaybe<CodingTool>;
};

export type SessionGroup = {
  __typename?: "SessionGroup";
  archivedAt?: Maybe<Scalars["DateTime"]["output"]>;
  branch?: Maybe<Scalars["String"]["output"]>;
  channel?: Maybe<Channel>;
  connection?: Maybe<SessionConnection>;
  createdAt: Scalars["DateTime"]["output"];
  forkedFromSessionGroup?: Maybe<SessionGroup>;
  forkedFromSessionGroupId?: Maybe<Scalars["ID"]["output"]>;
  gitCheckpoints: Array<GitCheckpoint>;
  id: Scalars["ID"]["output"];
  kind: SessionGroupKind;
  name: Scalars["String"]["output"];
  owner: User;
  prUrl?: Maybe<Scalars["String"]["output"]>;
  repo?: Maybe<Repo>;
  sessions: Array<Session>;
  setupError?: Maybe<Scalars["String"]["output"]>;
  setupStatus: SetupStatus;
  slug?: Maybe<Scalars["String"]["output"]>;
  status: SessionGroupStatus;
  updatedAt: Scalars["DateTime"]["output"];
  visibility: SessionGroupVisibility;
  workdir?: Maybe<Scalars["String"]["output"]>;
  /** True when the workspace is a user-owned worktree imported into Trace. */
  worktreeAdopted: Scalars["Boolean"]["output"];
  worktreeDeleted: Scalars["Boolean"]["output"];
};

export type SessionGroupDirectoryEntry = {
  __typename?: "SessionGroupDirectoryEntry";
  isDirectory: Scalars["Boolean"]["output"];
  name: Scalars["String"]["output"];
  path: Scalars["String"]["output"];
};

export type SessionGroupFileContentResult = {
  __typename?: "SessionGroupFileContentResult";
  content: Scalars["String"]["output"];
  ref: Scalars["String"]["output"];
  requestedRef: Scalars["String"]["output"];
  usedFallback: Scalars["Boolean"]["output"];
};

export type SessionGroupFileTree = {
  __typename?: "SessionGroupFileTree";
  paths: Array<Scalars["String"]["output"]>;
  truncated: Scalars["Boolean"]["output"];
};

export type SessionGroupKind = "app" | "coding" | "design";

export type SessionGroupStatus =
  | "archived"
  | "failed"
  | "in_progress"
  | "in_review"
  | "merged"
  | "needs_input"
  | "stopped";

export type SessionGroupVisibility = "private" | "public";

export type SessionPromptIndexItem = {
  __typename?: "SessionPromptIndexItem";
  actor: Actor;
  eventId: Scalars["ID"]["output"];
  imageCount: Scalars["Int"]["output"];
  preview: Scalars["String"]["output"];
  timestamp: Scalars["DateTime"]["output"];
};

export type SessionRuntimeInstance = {
  __typename?: "SessionRuntimeInstance";
  access: BridgeRuntimeAccess;
  connected: Scalars["Boolean"]["output"];
  hostingMode: HostingMode;
  id: Scalars["ID"]["output"];
  label: Scalars["String"]["output"];
  registeredRepoIds: Array<Scalars["ID"]["output"]>;
  sessionCount: Scalars["Int"]["output"];
  supportedTools: Array<CodingTool>;
};

export type SessionSearchResults = {
  __typename?: "SessionSearchResults";
  sessionGroups: Array<SessionGroup>;
  sessions: Array<Session>;
};

export type SessionSetupScriptRun = {
  __typename?: "SessionSetupScriptRun";
  command: Scalars["String"]["output"];
  completedAt?: Maybe<Scalars["DateTime"]["output"]>;
  exitCode?: Maybe<Scalars["Int"]["output"]>;
  id: Scalars["ID"]["output"];
  label: Scalars["String"]["output"];
  lastError?: Maybe<Scalars["String"]["output"]>;
  outputPreview?: Maybe<Scalars["String"]["output"]>;
  outputTruncated: Scalars["Boolean"]["output"];
  scriptConfigId: Scalars["String"]["output"];
  sessionGroupId: Scalars["ID"]["output"];
  startedAt: Scalars["DateTime"]["output"];
  status: SetupScriptRunStatus;
  workingDirectory: Scalars["String"]["output"];
};

export type SessionStatus = "in_progress" | "in_review" | "merged" | "needs_input";

export type SessionTimelineItem = {
  __typename?: "SessionTimelineItem";
  collapsed?: Maybe<CollapsedSessionEvents>;
  event?: Maybe<Event>;
  id: Scalars["ID"]["output"];
  kind: SessionTimelineItemKind;
};

export type SessionTimelineItemKind = "collapsed_events" | "event";

export type SessionTimelineMode = "compact" | "live";

export type SessionTimelinePage = {
  __typename?: "SessionTimelinePage";
  hasOlder: Scalars["Boolean"]["output"];
  items: Array<SessionTimelineItem>;
  mode: SessionTimelineMode;
};

export type SetApiTokenInput = {
  provider: ApiTokenProvider;
  token: Scalars["String"]["input"];
};

export type SetOrgSecretInput = {
  name: Scalars["String"]["input"];
  orgId: Scalars["ID"]["input"];
  value: Scalars["String"]["input"];
};

export type SetupScriptRunStatus = "completed" | "failed" | "running";

export type SetupStatus = "completed" | "failed" | "idle" | "running";

export type SlashCommand = {
  __typename?: "SlashCommand";
  category: SlashCommandCategory;
  description: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  source: SlashCommandSource;
};

export type SlashCommandCategory = "passthrough" | "special" | "terminal";

export type SlashCommandSource = "builtin" | "project_skill" | "user_skill";

export type StartSessionInput = {
  branch?: InputMaybe<Scalars["String"]["input"]>;
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  deferRuntimeSelection?: InputMaybe<Scalars["Boolean"]["input"]>;
  environmentId?: InputMaybe<Scalars["ID"]["input"]>;
  hosting?: InputMaybe<HostingMode>;
  interactionMode?: InputMaybe<Scalars["String"]["input"]>;
  kind?: InputMaybe<SessionGroupKind>;
  model?: InputMaybe<Scalars["String"]["input"]>;
  projectId?: InputMaybe<Scalars["ID"]["input"]>;
  prompt?: InputMaybe<Scalars["String"]["input"]>;
  reasoningEffort?: InputMaybe<Scalars["String"]["input"]>;
  repoId?: InputMaybe<Scalars["ID"]["input"]>;
  restoreCheckpointId?: InputMaybe<Scalars["ID"]["input"]>;
  runtimeInstanceId?: InputMaybe<Scalars["ID"]["input"]>;
  sessionGroupId?: InputMaybe<Scalars["ID"]["input"]>;
  sourceSessionId?: InputMaybe<Scalars["ID"]["input"]>;
  ticketId?: InputMaybe<Scalars["ID"]["input"]>;
  tool?: InputMaybe<CodingTool>;
  visibility?: InputMaybe<SessionGroupVisibility>;
  /** Absolute path to an existing local worktree to adopt instead of creating one. Local hosting only. */
  worktreePath?: InputMaybe<Scalars["String"]["input"]>;
};

export type Subscription = {
  __typename?: "Subscription";
  branchTurns: Turn;
  channelEvents: Event;
  chatEvents: Event;
  conversationEvents: AiConversationEvent;
  orgEvents: Event;
  sessionEvents: Event;
  sessionPortsChanged: SessionEndpoints;
  sessionStatusChanged: Session;
  ticketEvents: Event;
  userNotifications: Notification;
};

export type SubscriptionBranchTurnsArgs = {
  branchId: Scalars["ID"]["input"];
};

export type SubscriptionChannelEventsArgs = {
  channelId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type SubscriptionChatEventsArgs = {
  chatId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type SubscriptionConversationEventsArgs = {
  conversationId: Scalars["ID"]["input"];
};

export type SubscriptionOrgEventsArgs = {
  organizationId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type SubscriptionSessionEventsArgs = {
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type SubscriptionSessionPortsChangedArgs = {
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type SubscriptionSessionStatusChangedArgs = {
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
};

export type SubscriptionTicketEventsArgs = {
  organizationId: Scalars["ID"]["input"];
  ticketId: Scalars["ID"]["input"];
};

export type SubscriptionUserNotificationsArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type Terminal = {
  __typename?: "Terminal";
  id: Scalars["ID"]["output"];
  sessionId: Scalars["ID"]["output"];
};

export type TerminalEndpoint = {
  __typename?: "TerminalEndpoint";
  id: Scalars["String"]["output"];
  status: Scalars["String"]["output"];
  wsUrl: Scalars["String"]["output"];
};

export type ThreadSummary = {
  __typename?: "ThreadSummary";
  lastReplyAt?: Maybe<Scalars["DateTime"]["output"]>;
  participantIds: Array<Scalars["ID"]["output"]>;
  replyCount: Scalars["Int"]["output"];
  rootMessageId: Scalars["ID"]["output"];
};

export type Ticket = {
  __typename?: "Ticket";
  assignees: Array<User>;
  channel?: Maybe<Channel>;
  createdAt: Scalars["DateTime"]["output"];
  createdBy: User;
  description: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  labels: Array<Scalars["String"]["output"]>;
  links: Array<TicketLink>;
  origin?: Maybe<Event>;
  priority: Priority;
  projects: Array<Project>;
  sessions: Array<Session>;
  status: TicketStatus;
  title: Scalars["String"]["output"];
  updatedAt: Scalars["DateTime"]["output"];
};

export type TicketFilters = {
  channelId?: InputMaybe<Scalars["ID"]["input"]>;
  priority?: InputMaybe<Priority>;
  status?: InputMaybe<TicketStatus>;
};

export type TicketLink = {
  __typename?: "TicketLink";
  createdAt: Scalars["DateTime"]["output"];
  entityId: Scalars["ID"]["output"];
  entityType: EntityType;
  id: Scalars["ID"]["output"];
};

export type TicketStatus = "backlog" | "cancelled" | "done" | "in_progress" | "in_review" | "todo";

export type Turn = {
  __typename?: "Turn";
  branch: Branch;
  branchCount: Scalars["Int"]["output"];
  childBranches: Array<Branch>;
  content: Scalars["String"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  parentTurn?: Maybe<Turn>;
  role: TurnRole;
};

export type TurnRole = "ASSISTANT" | "USER";

export type UpdateAgentEnvironmentInput = {
  adapterType?: InputMaybe<AgentEnvironmentAdapterType>;
  config?: InputMaybe<Scalars["JSON"]["input"]>;
  enabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  id: Scalars["ID"]["input"];
  isDefault?: InputMaybe<Scalars["Boolean"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateChannelGroupInput = {
  isCollapsed?: InputMaybe<Scalars["Boolean"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  position?: InputMaybe<Scalars["Int"]["input"]>;
};

export type UpdateChannelInput = {
  baseBranch?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  runScripts?: InputMaybe<Scalars["JSON"]["input"]>;
  setupScript?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateRepoInput = {
  applicationConfig?: InputMaybe<RepoApplicationConfigInput>;
  defaultBranch?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  /**
   * Named launcher runtime profile for cloud sessions on this repo (e.g. a
   * larger image/resources preset). Empty string clears the profile.
   */
  runtimeProfile?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateSessionDefaultsInput = {
  autoArchiveMergedSessions?: InputMaybe<Scalars["Boolean"]["input"]>;
  enableClaudeInChrome?: InputMaybe<Scalars["Boolean"]["input"]>;
  model?: InputMaybe<Scalars["String"]["input"]>;
  reasoningEffort?: InputMaybe<Scalars["String"]["input"]>;
  tool?: InputMaybe<CodingTool>;
};

export type UpdateTicketInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  labels?: InputMaybe<Array<Scalars["String"]["input"]>>;
  priority?: InputMaybe<Priority>;
  status?: InputMaybe<TicketStatus>;
  title?: InputMaybe<Scalars["String"]["input"]>;
};

export type User = {
  __typename?: "User";
  autoArchiveMergedSessions: Scalars["Boolean"]["output"];
  avatarUrl?: Maybe<Scalars["String"]["output"]>;
  defaultSessionModel?: Maybe<Scalars["String"]["output"]>;
  defaultSessionReasoningEffort?: Maybe<Scalars["String"]["output"]>;
  defaultSessionTool?: Maybe<CodingTool>;
  email: Scalars["String"]["output"];
  enableClaudeInChrome: Scalars["Boolean"]["output"];
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  organizations: Array<OrgMember>;
};

export type UserRole = "admin" | "member" | "observer";

export type WorkflowRunStatus = "completed" | "failed" | "running";

export type WorkflowStepKind = "process" | "setup";

export type WorkflowStepStatus = "completed" | "failed" | "pending" | "running";

export type WorktreeChangesResult = {
  __typename?: "WorktreeChangesResult";
  files: Array<LinkedCheckoutChangedFile>;
  totalCount: Scalars["Int"]["output"];
  truncated: Scalars["Boolean"]["output"];
};

export type SendChannelMessageMutationVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
}>;

export type SendChannelMessageMutation = {
  __typename?: "Mutation";
  sendChannelMessage: { __typename?: "Message"; id: string };
};

export type ChannelMembersQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type ChannelMembersQuery = {
  __typename?: "Query";
  channel?: {
    __typename?: "Channel";
    id: string;
    members: Array<{
      __typename?: "ChannelMember";
      user: {
        __typename?: "User";
        id: string;
        name: string;
        email: string;
        avatarUrl?: string | null;
      };
    }>;
  } | null;
};

export type AddChannelMemberMutationVariables = Exact<{
  input: AddChannelMemberInput;
}>;

export type AddChannelMemberMutation = {
  __typename?: "Mutation";
  addChannelMember: { __typename?: "Channel"; id: string };
};

export type SessionGroupsQueryVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  archived?: InputMaybe<Scalars["Boolean"]["input"]>;
}>;

export type SessionGroupsQuery = {
  __typename?: "Query";
  sessionGroups: Array<{
    __typename?: "SessionGroup";
    id: string;
    name: string;
    slug?: string | null;
    forkedFromSessionGroupId?: string | null;
    status: SessionGroupStatus;
    visibility: SessionGroupVisibility;
    prUrl?: string | null;
    worktreeDeleted: boolean;
    archivedAt?: string | null;
    setupStatus: SetupStatus;
    setupError?: string | null;
    createdAt: string;
    updatedAt: string;
    owner: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    channel?: { __typename?: "Channel"; id: string } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      name: string;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      tool: CodingTool;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting: HostingMode;
      branch?: string | null;
      workdir?: string | null;
      prUrl?: string | null;
      worktreeDeleted: boolean;
      sessionGroupId?: string | null;
      lastUserMessageAt?: string | null;
      lastMessageAt?: string | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      costUsd: number;
      createdAt: string;
      updatedAt: string;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
      createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
      repo?: { __typename?: "Repo"; id: string; name: string; remoteUrl?: string | null } | null;
      channel?: { __typename?: "Channel"; id: string } | null;
    }>;
  }>;
};

export type FilteredSessionGroupsQueryVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  archived?: InputMaybe<Scalars["Boolean"]["input"]>;
  status?: InputMaybe<SessionGroupStatus>;
}>;

export type FilteredSessionGroupsQuery = {
  __typename?: "Query";
  sessionGroups: Array<{
    __typename?: "SessionGroup";
    id: string;
    name: string;
    forkedFromSessionGroupId?: string | null;
    status: SessionGroupStatus;
    visibility: SessionGroupVisibility;
    prUrl?: string | null;
    worktreeDeleted: boolean;
    archivedAt?: string | null;
    setupStatus: SetupStatus;
    setupError?: string | null;
    createdAt: string;
    updatedAt: string;
    owner: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    channel?: { __typename?: "Channel"; id: string } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      name: string;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      tool: CodingTool;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting: HostingMode;
      branch?: string | null;
      workdir?: string | null;
      prUrl?: string | null;
      worktreeDeleted: boolean;
      sessionGroupId?: string | null;
      lastUserMessageAt?: string | null;
      lastMessageAt?: string | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      costUsd: number;
      createdAt: string;
      updatedAt: string;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
      createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
      repo?: { __typename?: "Repo"; id: string; name: string; remoteUrl?: string | null } | null;
      channel?: { __typename?: "Channel"; id: string } | null;
    }>;
  }>;
};

export type AddChatMemberMutationVariables = Exact<{
  input: AddChatMemberInput;
}>;

export type AddChatMemberMutation = {
  __typename?: "Mutation";
  addChatMember: { __typename?: "Chat"; id: string };
};

export type SendChatMessageMutationVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  html?: InputMaybe<Scalars["String"]["input"]>;
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type SendChatMessageMutation = {
  __typename?: "Mutation";
  sendChatMessage: { __typename?: "Message"; id: string };
};

export type RenameChatMutationVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
}>;

export type RenameChatMutation = {
  __typename?: "Mutation";
  renameChat: { __typename?: "Chat"; id: string; name?: string | null };
};

export type ThreadRepliesQueryVariables = Exact<{
  rootMessageId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type ThreadRepliesQuery = {
  __typename?: "Query";
  threadReplies: Array<{
    __typename?: "Message";
    id: string;
    chatId?: string | null;
    channelId?: string | null;
    text: string;
    html?: string | null;
    mentions?: JsonValue | null;
    parentMessageId?: string | null;
    replyCount: number;
    latestReplyAt?: string | null;
    createdAt: string;
    updatedAt: string;
    editedAt?: string | null;
    deletedAt?: string | null;
    threadRepliers: Array<{
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    }>;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type SessionGroupBranchDiffQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionGroupBranchDiffQuery = {
  __typename?: "Query";
  sessionGroupBranchDiff: Array<{
    __typename?: "BranchDiffFile";
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
};

export type SessionGroupWorktreeChangesQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionGroupWorktreeChangesQuery = {
  __typename?: "Query";
  sessionGroupWorktreeChanges: {
    __typename?: "WorktreeChangesResult";
    totalCount: number;
    truncated: boolean;
    files: Array<{
      __typename?: "LinkedCheckoutChangedFile";
      path: string;
      status: string;
      additions: number;
      deletions: number;
      diff: string;
      truncated: boolean;
      originalContent: string;
      modifiedContent: string;
      contentTruncated: boolean;
    }>;
  };
};

export type RevertSessionGroupFileChangeMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
}>;

export type RevertSessionGroupFileChangeMutation = {
  __typename?: "Mutation";
  revertSessionGroupFileChange: boolean;
};

export type SessionGroupFileAtRefQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
  ref: Scalars["String"]["input"];
}>;

export type SessionGroupFileAtRefQuery = { __typename?: "Query"; sessionGroupFileAtRef: string };

export type SessionGroupFileContentForDiffQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
}>;

export type SessionGroupFileContentForDiffQuery = {
  __typename?: "Query";
  sessionGroupFileContent: string;
};

export type SessionGroupFileContentQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
}>;

export type SessionGroupFileContentQuery = {
  __typename?: "Query";
  sessionGroupFileContentWithSource: {
    __typename?: "SessionGroupFileContentResult";
    content: string;
    ref: string;
    requestedRef: string;
    usedFallback: boolean;
  };
};

export type SaveSessionGroupFileMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  filePath: Scalars["String"]["input"];
  content: Scalars["String"]["input"];
}>;

export type SaveSessionGroupFileMutation = {
  __typename?: "Mutation";
  saveSessionGroupFile: boolean;
};

export type CommitSessionGroupFileChangesMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  message?: InputMaybe<Scalars["String"]["input"]>;
}>;

export type CommitSessionGroupFileChangesMutation = {
  __typename?: "Mutation";
  commitSessionGroupFileChanges: string;
};

export type SessionGroupWorktreeChangesForCommitButtonQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionGroupWorktreeChangesForCommitButtonQuery = {
  __typename?: "Query";
  sessionGroupWorktreeChanges: { __typename?: "WorktreeChangesResult"; totalCount: number };
};

export type SessionDetailQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type SessionDetailQuery = {
  __typename?: "Query";
  session?: {
    __typename?: "Session";
    id: string;
    name: string;
    agentStatus: AgentStatus;
    sessionStatus: SessionStatus;
    tool: CodingTool;
    model?: string | null;
    reasoningEffort?: string | null;
    hosting: HostingMode;
    branch?: string | null;
    workdir?: string | null;
    prUrl?: string | null;
    worktreeDeleted: boolean;
    lastUserMessageAt?: string | null;
    lastMessageAt?: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    sessionGroupId?: string | null;
    createdAt: string;
    updatedAt: string;
    repo?: { __typename?: "Repo"; id: string; name: string; remoteUrl?: string | null } | null;
    connection?: {
      __typename?: "SessionConnection";
      state: SessionConnectionState;
      runtimeInstanceId?: string | null;
      runtimeLabel?: string | null;
      lastError?: string | null;
      retryCount: number;
      canRetry: boolean;
      canMove: boolean;
      autoRetryable?: boolean | null;
    } | null;
    createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    sessionGroup?: {
      __typename?: "SessionGroup";
      id: string;
      name: string;
      branch?: string | null;
      prUrl?: string | null;
      workdir?: string | null;
      worktreeDeleted: boolean;
      createdAt: string;
      updatedAt: string;
      setupStatus: SetupStatus;
      setupError?: string | null;
      gitCheckpoints: Array<{
        __typename?: "GitCheckpoint";
        id: string;
        sessionId: string;
        promptEventId: string;
        commitSha: string;
        subject: string;
        author: string;
        committedAt: string;
        filesChanged: number;
        captureStatus?: GitCheckpointCaptureStatus | null;
        captureUrl?: string | null;
        capturedAt?: string | null;
        createdAt: string;
      }>;
      channel?: { __typename?: "Channel"; id: string } | null;
      repo?: {
        __typename?: "Repo";
        id: string;
        name: string;
        remoteUrl?: string | null;
        applicationConfig: {
          __typename?: "RepoApplicationConfig";
          setupScripts: Array<{
            __typename?: "RepoSetupScript";
            id: string;
            name: string;
            command: string;
            workingDirectory?: string | null;
            env: Array<{ __typename?: "RepoEnvVar"; key: string; secretName: string }>;
          }>;
          applications: Array<{
            __typename?: "RepoApplicationDefinition";
            id: string;
            name: string;
            processes: Array<{
              __typename?: "RepoProcessDefinition";
              id: string;
              name: string;
              command: string;
              workingDirectory?: string | null;
              required: boolean;
              env: Array<{ __typename?: "RepoEnvVar"; key: string; secretName: string }>;
              ports: Array<{
                __typename?: "RepoPortDefinition";
                id: string;
                label: string;
                port: number;
                protocol: string;
                defaultForwardingEnabled: boolean;
                healthPath?: string | null;
              }>;
            }>;
          }>;
        };
      } | null;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
    } | null;
    gitCheckpoints: Array<{
      __typename?: "GitCheckpoint";
      id: string;
      sessionId: string;
      promptEventId: string;
      commitSha: string;
      subject: string;
      author: string;
      committedAt: string;
      filesChanged: number;
      captureStatus?: GitCheckpointCaptureStatus | null;
      captureUrl?: string | null;
      capturedAt?: string | null;
      createdAt: string;
    }>;
    channel?: { __typename?: "Channel"; id: string } | null;
    queuedMessages: Array<{
      __typename?: "QueuedMessage";
      id: string;
      sessionId: string;
      text: string;
      interactionMode?: string | null;
      position: number;
      createdAt: string;
      imageKeys: Array<string>;
    }>;
  } | null;
};

export type SessionGroupDetailQueryVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type SessionGroupDetailQuery = {
  __typename?: "Query";
  sessionGroup?: {
    __typename?: "SessionGroup";
    id: string;
    name: string;
    kind: SessionGroupKind;
    slug?: string | null;
    forkedFromSessionGroupId?: string | null;
    status: SessionGroupStatus;
    visibility: SessionGroupVisibility;
    archivedAt?: string | null;
    branch?: string | null;
    prUrl?: string | null;
    workdir?: string | null;
    worktreeDeleted: boolean;
    worktreeAdopted: boolean;
    setupStatus: SetupStatus;
    setupError?: string | null;
    createdAt: string;
    updatedAt: string;
    owner: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    gitCheckpoints: Array<{
      __typename?: "GitCheckpoint";
      id: string;
      sessionId: string;
      promptEventId: string;
      commitSha: string;
      subject: string;
      author: string;
      committedAt: string;
      filesChanged: number;
      captureStatus?: GitCheckpointCaptureStatus | null;
      captureUrl?: string | null;
      capturedAt?: string | null;
      createdAt: string;
    }>;
    repo?: {
      __typename?: "Repo";
      id: string;
      name: string;
      remoteUrl?: string | null;
      defaultBranch: string;
    } | null;
    connection?: {
      __typename?: "SessionConnection";
      state: SessionConnectionState;
      runtimeInstanceId?: string | null;
      runtimeLabel?: string | null;
      lastError?: string | null;
      retryCount: number;
      canRetry: boolean;
      canMove: boolean;
      autoRetryable?: boolean | null;
    } | null;
    channel?: { __typename?: "Channel"; id: string } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      name: string;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      tool: CodingTool;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting: HostingMode;
      branch?: string | null;
      workdir?: string | null;
      worktreeDeleted: boolean;
      sessionGroupId?: string | null;
      lastUserMessageAt?: string | null;
      lastMessageAt?: string | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      costUsd: number;
      createdAt: string;
      updatedAt: string;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
      createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
      repo?: { __typename?: "Repo"; id: string; name: string; remoteUrl?: string | null } | null;
      channel?: { __typename?: "Channel"; id: string } | null;
    }>;
  } | null;
};

export type AppPreviewStateQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type AppPreviewStateQuery = {
  __typename?: "Query";
  sessionEndpoints: Array<{
    __typename?: "SessionEndpoint";
    id: string;
    sessionGroupId: string;
    appConfigId: string;
    processConfigId: string;
    portConfigId: string;
    label: string;
    targetPort: number;
    url: string;
    status: SessionEndpointStatus;
    accessMode: SessionEndpointAccessMode;
    trafficCaptureMode: EndpointTrafficCaptureMode;
    enabledAt?: string | null;
    disabledAt?: string | null;
    revokedAt?: string | null;
  }>;
  sessionApplicationProcesses: Array<{
    __typename?: "SessionApplicationProcess";
    id: string;
    sessionGroupId: string;
    appConfigId: string;
    processConfigId: string;
    label: string;
    status: ApplicationProcessStatus;
    runtimeInstanceId?: string | null;
    startedAt?: string | null;
    stoppedAt?: string | null;
    exitCode?: number | null;
    lastError?: string | null;
  }>;
};

export type StartSessionApplicationWorkflowMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  appConfigId: Scalars["ID"]["input"];
}>;

export type StartSessionApplicationWorkflowMutation = {
  __typename?: "Mutation";
  startSessionApplicationWorkflow: { __typename?: "SessionApplicationWorkflowRun"; id: string };
};

export type SessionEndpointTrafficEndpointsQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionEndpointTrafficEndpointsQuery = {
  __typename?: "Query";
  sessionEndpoints: Array<{
    __typename?: "SessionEndpoint";
    id: string;
    key: string;
    url: string;
    sessionGroupId: string;
    appConfigId: string;
    processConfigId: string;
    portConfigId: string;
    label: string;
    targetPort: number;
    status: SessionEndpointStatus;
    accessMode: SessionEndpointAccessMode;
    trafficCaptureMode: EndpointTrafficCaptureMode;
    enabledAt?: string | null;
    disabledAt?: string | null;
    revokedAt?: string | null;
  }>;
};

export type EndpointTrafficTabQueryVariables = Exact<{
  endpointId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type EndpointTrafficTabQuery = {
  __typename?: "Query";
  endpointTraffic: Array<{
    __typename?: "EndpointTrafficEntry";
    id: string;
    endpointId: string;
    startedAt: string;
    durationMs?: number | null;
    requestMethod: string;
    requestPath: string;
    responseStatus?: number | null;
    error?: string | null;
  }>;
};

export type ClearEndpointTrafficTabMutationVariables = Exact<{
  endpointId: Scalars["ID"]["input"];
}>;

export type ClearEndpointTrafficTabMutation = {
  __typename?: "Mutation";
  clearEndpointTraffic: boolean;
};

export type SessionApplicationsStateQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionApplicationsStateQuery = {
  __typename?: "Query";
  sessionGroup?: {
    __typename?: "SessionGroup";
    id: string;
    repo?: {
      __typename?: "Repo";
      id: string;
      applicationConfig: {
        __typename?: "RepoApplicationConfig";
        setupScripts: Array<{
          __typename?: "RepoSetupScript";
          id: string;
          name: string;
          command: string;
          workingDirectory?: string | null;
          env: Array<{ __typename?: "RepoEnvVar"; key: string; secretName: string }>;
        }>;
        applications: Array<{
          __typename?: "RepoApplicationDefinition";
          id: string;
          name: string;
          processes: Array<{
            __typename?: "RepoProcessDefinition";
            id: string;
            name: string;
            command: string;
            workingDirectory?: string | null;
            required: boolean;
            env: Array<{ __typename?: "RepoEnvVar"; key: string; secretName: string }>;
            ports: Array<{
              __typename?: "RepoPortDefinition";
              id: string;
              label: string;
              port: number;
              protocol: string;
              defaultForwardingEnabled: boolean;
              healthPath?: string | null;
            }>;
          }>;
        }>;
      };
    } | null;
  } | null;
  sessionApplicationProcesses: Array<{
    __typename?: "SessionApplicationProcess";
    id: string;
    sessionGroupId: string;
    appConfigId: string;
    processConfigId: string;
    label: string;
    status: ApplicationProcessStatus;
    runtimeInstanceId?: string | null;
    startedAt?: string | null;
    stoppedAt?: string | null;
    exitCode?: number | null;
    lastError?: string | null;
  }>;
  sessionSetupScriptRuns: Array<{
    __typename?: "SessionSetupScriptRun";
    id: string;
    sessionGroupId: string;
    scriptConfigId: string;
    label: string;
    command: string;
    workingDirectory: string;
    status: SetupScriptRunStatus;
    exitCode?: number | null;
    outputPreview?: string | null;
    outputTruncated: boolean;
    lastError?: string | null;
    startedAt: string;
    completedAt?: string | null;
  }>;
  sessionApplicationWorkflowRuns: Array<{
    __typename?: "SessionApplicationWorkflowRun";
    id: string;
    sessionGroupId: string;
    appConfigId: string;
    status: WorkflowRunStatus;
    lastError?: string | null;
    startedAt: string;
    completedAt?: string | null;
    steps: Array<{
      __typename?: "SessionApplicationWorkflowStep";
      stepId: string;
      kind: WorkflowStepKind;
      label: string;
      status: WorkflowStepStatus;
      dependsOn: Array<string>;
      optional: boolean;
    }>;
  }>;
  sessionEndpoints: Array<{
    __typename?: "SessionEndpoint";
    id: string;
    key: string;
    url: string;
    sessionGroupId: string;
    appConfigId: string;
    processConfigId: string;
    portConfigId: string;
    label: string;
    targetPort: number;
    status: SessionEndpointStatus;
    accessMode: SessionEndpointAccessMode;
    trafficCaptureMode: EndpointTrafficCaptureMode;
    enabledAt?: string | null;
    disabledAt?: string | null;
    revokedAt?: string | null;
  }>;
};

export type SessionApplicationProcessLogsQueryVariables = Exact<{
  processId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type SessionApplicationProcessLogsQuery = {
  __typename?: "Query";
  sessionApplicationLogs: Array<{
    __typename?: "SessionApplicationLogEntry";
    id: string;
    processId: string;
    stream: string;
    data: string;
    sequence: number;
    timestamp: string;
  }>;
};

export type RunSessionGroupSetupScriptMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  scriptId: Scalars["ID"]["input"];
}>;

export type RunSessionGroupSetupScriptMutation = {
  __typename?: "Mutation";
  runSessionGroupSetupScript: boolean;
};

export type StartSessionProcessMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  appConfigId: Scalars["ID"]["input"];
  processConfigId: Scalars["ID"]["input"];
}>;

export type StartSessionProcessMutation = {
  __typename?: "Mutation";
  startSessionProcess: { __typename?: "SessionApplicationProcess"; id: string };
};

export type StopSessionProcessMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  appConfigId: Scalars["ID"]["input"];
  processConfigId: Scalars["ID"]["input"];
}>;

export type StopSessionProcessMutation = {
  __typename?: "Mutation";
  stopSessionProcess: { __typename?: "SessionApplicationProcess"; id: string };
};

export type EnableSessionEndpointForwardingMutationVariables = Exact<{
  endpointId: Scalars["ID"]["input"];
  accessMode: SessionEndpointAccessMode;
}>;

export type EnableSessionEndpointForwardingMutation = {
  __typename?: "Mutation";
  enableSessionEndpointForwarding: { __typename?: "SessionEndpoint"; id: string };
};

export type DisableSessionEndpointForwardingMutationVariables = Exact<{
  endpointId: Scalars["ID"]["input"];
}>;

export type DisableSessionEndpointForwardingMutation = {
  __typename?: "Mutation";
  disableSessionEndpointForwarding: { __typename?: "SessionEndpoint"; id: string };
};

export type PublishAppSessionMutationVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type PublishAppSessionMutation = {
  __typename?: "Mutation";
  publishAppSession: { __typename?: "SessionEndpoint"; id: string };
};

export type CreateSessionEndpointPreviewMutationVariables = Exact<{
  endpointId: Scalars["ID"]["input"];
}>;

export type CreateSessionEndpointPreviewMutation = {
  __typename?: "Mutation";
  createSessionEndpointPreview: { __typename?: "SessionEndpointPreview"; url: string };
};

export type SessionGroupFileTreeQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionGroupFileTreeQuery = {
  __typename?: "Query";
  sessionGroupFileTree: {
    __typename?: "SessionGroupFileTree";
    paths: Array<string>;
    truncated: boolean;
  };
};

export type SessionGroupDirectoryEntriesQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
  directoryPath: Scalars["String"]["input"];
  depth?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type SessionGroupDirectoryEntriesQuery = {
  __typename?: "Query";
  sessionGroupDirectoryEntries: Array<{
    __typename?: "SessionGroupDirectoryEntry";
    name: string;
    path: string;
    isDirectory: boolean;
  }>;
};

export type SessionGroupFilesQueryVariables = Exact<{
  sessionGroupId: Scalars["ID"]["input"];
}>;

export type SessionGroupFilesQuery = { __typename?: "Query"; sessionGroupFiles: Array<string> };

export type MyApiTokensQueryVariables = Exact<{ [key: string]: never }>;

export type MyApiTokensQuery = {
  __typename?: "Query";
  myApiTokens: Array<{
    __typename?: "ApiTokenStatus";
    provider: ApiTokenProvider;
    isSet: boolean;
    updatedAt?: string | null;
  }>;
};

export type SetApiTokenMutationVariables = Exact<{
  input: SetApiTokenInput;
}>;

export type SetApiTokenMutation = {
  __typename?: "Mutation";
  setApiToken: {
    __typename?: "ApiTokenStatus";
    provider: ApiTokenProvider;
    isSet: boolean;
    updatedAt?: string | null;
  };
};

export type DeleteApiTokenMutationVariables = Exact<{
  provider: ApiTokenProvider;
}>;

export type DeleteApiTokenMutation = { __typename?: "Mutation"; deleteApiToken: boolean };

export type AddOrgMemberMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
  role?: InputMaybe<UserRole>;
}>;

export type AddOrgMemberMutation = {
  __typename?: "Mutation";
  addOrgMember: {
    __typename?: "OrgMember";
    role: UserRole;
    joinedAt: string;
    user: {
      __typename?: "User";
      id: string;
      name: string;
      email: string;
      avatarUrl?: string | null;
    };
  };
};

export type RemoveOrgMemberMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
}>;

export type RemoveOrgMemberMutation = { __typename?: "Mutation"; removeOrgMember: boolean };

export type UpdateOrgMemberRoleMutationVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  userId: Scalars["ID"]["input"];
  role: UserRole;
}>;

export type UpdateOrgMemberRoleMutation = {
  __typename?: "Mutation";
  updateOrgMemberRole: {
    __typename?: "OrgMember";
    role: UserRole;
    user: { __typename?: "User"; id: string };
  };
};

export type SearchUsersQueryVariables = Exact<{
  query: Scalars["String"]["input"];
}>;

export type SearchUsersQuery = {
  __typename?: "Query";
  searchUsers: Array<{
    __typename?: "User";
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  }>;
};

export type SettingsReposQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type SettingsReposQuery = {
  __typename?: "Query";
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    provider: RepoProvider;
    remoteUrl?: string | null;
    defaultBranch: string;
    webhookActive: boolean;
    applicationConfig: {
      __typename?: "RepoApplicationConfig";
      setupScripts: Array<{
        __typename?: "RepoSetupScript";
        id: string;
        name: string;
        command: string;
        workingDirectory?: string | null;
        env: Array<{ __typename?: "RepoEnvVar"; key: string; secretName: string }>;
      }>;
      applications: Array<{
        __typename?: "RepoApplicationDefinition";
        id: string;
        name: string;
        processes: Array<{
          __typename?: "RepoProcessDefinition";
          id: string;
          name: string;
          command: string;
          workingDirectory?: string | null;
          required: boolean;
          env: Array<{ __typename?: "RepoEnvVar"; key: string; secretName: string }>;
          ports: Array<{
            __typename?: "RepoPortDefinition";
            id: string;
            label: string;
            port: number;
            protocol: string;
            defaultForwardingEnabled: boolean;
            healthPath?: string | null;
          }>;
        }>;
      }>;
    };
  }>;
};

export type AgentEnvironmentsSettingsQueryVariables = Exact<{
  orgId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
}>;

export type AgentEnvironmentsSettingsQuery = {
  __typename?: "Query";
  agentEnvironments: Array<{
    __typename?: "AgentEnvironment";
    id: string;
    orgId: string;
    name: string;
    adapterType: AgentEnvironmentAdapterType;
    config: JsonValue;
    enabled: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    provider: RepoProvider;
    remoteUrl?: string | null;
    defaultBranch: string;
    webhookActive: boolean;
  }>;
  orgSecrets: Array<{
    __typename?: "OrgSecret";
    id: string;
    orgId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
  myConnections: Array<{
    __typename?: "ConnectionsBridge";
    bridge: {
      __typename?: "BridgeRuntime";
      id: string;
      instanceId: string;
      label: string;
      hostingMode: HostingMode;
      connected: boolean;
    };
    repos: Array<{
      __typename?: "ConnectionsRepoEntry";
      repo: { __typename?: "Repo"; id: string; name: string };
    }>;
  }>;
};

export type OrgSecretsQueryVariables = Exact<{
  orgId: Scalars["ID"]["input"];
}>;

export type OrgSecretsQuery = {
  __typename?: "Query";
  orgSecrets: Array<{
    __typename?: "OrgSecret";
    id: string;
    orgId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type CreateAgentEnvironmentMutationVariables = Exact<{
  input: CreateAgentEnvironmentInput;
}>;

export type CreateAgentEnvironmentMutation = {
  __typename?: "Mutation";
  createAgentEnvironment: {
    __typename?: "AgentEnvironment";
    id: string;
    orgId: string;
    name: string;
    adapterType: AgentEnvironmentAdapterType;
    config: JsonValue;
    enabled: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

export type UpdateAgentEnvironmentMutationVariables = Exact<{
  input: UpdateAgentEnvironmentInput;
}>;

export type UpdateAgentEnvironmentMutation = {
  __typename?: "Mutation";
  updateAgentEnvironment: {
    __typename?: "AgentEnvironment";
    id: string;
    orgId: string;
    name: string;
    adapterType: AgentEnvironmentAdapterType;
    config: JsonValue;
    enabled: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteAgentEnvironmentMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteAgentEnvironmentMutation = {
  __typename?: "Mutation";
  deleteAgentEnvironment: boolean;
};

export type TestAgentEnvironmentMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type TestAgentEnvironmentMutation = {
  __typename?: "Mutation";
  testAgentEnvironment: {
    __typename?: "AgentEnvironmentTestResult";
    ok: boolean;
    message?: string | null;
  };
};

export type SetOrgSecretMutationVariables = Exact<{
  input: SetOrgSecretInput;
}>;

export type SetOrgSecretMutation = {
  __typename?: "Mutation";
  setOrgSecret: {
    __typename?: "OrgSecret";
    id: string;
    orgId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
};

export type DeleteOrgSecretMutationVariables = Exact<{
  orgId: Scalars["ID"]["input"];
  id: Scalars["ID"]["input"];
}>;

export type DeleteOrgSecretMutation = { __typename?: "Mutation"; deleteOrgSecret: boolean };

export type CreateRepoMutationVariables = Exact<{
  input: CreateRepoInput;
}>;

export type CreateRepoMutation = {
  __typename?: "Mutation";
  createRepo: { __typename?: "Repo"; id: string };
};

export type CreateDmMutationVariables = Exact<{
  input: CreateChatInput;
}>;

export type CreateDmMutation = {
  __typename?: "Mutation";
  createChat: { __typename?: "Chat"; id: string };
};

export type AppSessionGroupsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type AppSessionGroupsQuery = {
  __typename?: "Query";
  appSessionGroups: Array<{
    __typename?: "SessionGroup";
    id: string;
    name: string;
    slug?: string | null;
    kind: SessionGroupKind;
    status: SessionGroupStatus;
    visibility: SessionGroupVisibility;
    connection?: { __typename?: "SessionConnection"; state: SessionConnectionState } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      sessionGroupId?: string | null;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      prUrl?: string | null;
      worktreeDeleted: boolean;
      lastMessageAt?: string | null;
      lastUserMessageAt?: string | null;
      updatedAt: string;
      createdAt: string;
    }>;
  }>;
};

export type AllChannelsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type AllChannelsQuery = {
  __typename?: "Query";
  channels: Array<{
    __typename?: "Channel";
    id: string;
    name: string;
    type: ChannelType;
    visibility: ChannelVisibility;
    memberCount: number;
    viewerIsMember: boolean;
  }>;
};

export type JoinChannelMutationVariables = Exact<{
  channelId: Scalars["ID"]["input"];
}>;

export type JoinChannelMutation = {
  __typename?: "Mutation";
  joinChannel: { __typename?: "Channel"; id: string };
};

export type LeaveChannelMutationVariables = Exact<{
  channelId: Scalars["ID"]["input"];
}>;

export type LeaveChannelMutation = {
  __typename?: "Mutation";
  leaveChannel: { __typename?: "Channel"; id: string };
};

export type UpdateChannelGroupCollapseMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
  input: UpdateChannelGroupInput;
}>;

export type UpdateChannelGroupCollapseMutation = {
  __typename?: "Mutation";
  updateChannelGroup: { __typename?: "ChannelGroup"; id: string };
};

export type CreateChannelMutationVariables = Exact<{
  input: CreateChannelInput;
}>;

export type CreateChannelMutation = {
  __typename?: "Mutation";
  createChannel: { __typename?: "Channel"; id: string };
};

export type CreateChannelGroupMutationVariables = Exact<{
  input: CreateChannelGroupInput;
}>;

export type CreateChannelGroupMutation = {
  __typename?: "Mutation";
  createChannelGroup: { __typename?: "ChannelGroup"; id: string };
};

export type CreateChatMutationVariables = Exact<{
  input: CreateChatInput;
}>;

export type CreateChatMutation = {
  __typename?: "Mutation";
  createChat: { __typename?: "Chat"; id: string };
};

export type DeleteChannelGroupMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
}>;

export type DeleteChannelGroupMutation = { __typename?: "Mutation"; deleteChannelGroup: boolean };

export type TicketsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type TicketsQuery = {
  __typename?: "Query";
  tickets: Array<{
    __typename?: "Ticket";
    id: string;
    title: string;
    description: string;
    status: TicketStatus;
    priority: Priority;
    labels: Array<string>;
    createdAt: string;
    updatedAt: string;
    assignees: Array<{ __typename?: "User"; id: string; name: string; avatarUrl?: string | null }>;
    createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    channel?: { __typename?: "Channel"; id: string } | null;
  }>;
};

export type MoveChannelMutationVariables = Exact<{
  input: MoveChannelInput;
}>;

export type MoveChannelMutation = {
  __typename?: "Mutation";
  moveChannel: { __typename?: "Channel"; id: string };
};

export type UpdateChannelGroupPositionMutationVariables = Exact<{
  id: Scalars["ID"]["input"];
  input: UpdateChannelGroupInput;
}>;

export type UpdateChannelGroupPositionMutation = {
  __typename?: "Mutation";
  updateChannelGroup: { __typename?: "ChannelGroup"; id: string };
};

export type ReorderChannelsMutationVariables = Exact<{
  input: ReorderChannelsInput;
}>;

export type ReorderChannelsMutation = {
  __typename?: "Mutation";
  reorderChannels: Array<{ __typename?: "Channel"; id: string }>;
};

export type ChannelMessagesQueryVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
}>;

export type ChannelMessagesQuery = {
  __typename?: "Query";
  channelMessages: Array<{
    __typename?: "Message";
    id: string;
    chatId?: string | null;
    channelId?: string | null;
    text: string;
    html?: string | null;
    mentions?: JsonValue | null;
    parentMessageId?: string | null;
    replyCount: number;
    latestReplyAt?: string | null;
    createdAt: string;
    updatedAt: string;
    editedAt?: string | null;
    deletedAt?: string | null;
    threadRepliers: Array<{
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    }>;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type ChannelEventsForMessagesSubscriptionVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type ChannelEventsForMessagesSubscription = {
  __typename?: "Subscription";
  channelEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type ChatMessagesQueryVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
}>;

export type ChatMessagesQuery = {
  __typename?: "Query";
  chatMessages: Array<{
    __typename?: "Message";
    id: string;
    chatId?: string | null;
    text: string;
    html?: string | null;
    mentions?: JsonValue | null;
    parentMessageId?: string | null;
    replyCount: number;
    latestReplyAt?: string | null;
    createdAt: string;
    updatedAt: string;
    editedAt?: string | null;
    deletedAt?: string | null;
    threadRepliers: Array<{
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    }>;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type ChatEventsSubscriptionSubscriptionVariables = Exact<{
  chatId: Scalars["ID"]["input"];
  types?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type ChatEventsSubscriptionSubscription = {
  __typename?: "Subscription";
  chatEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type OrgEventsSubscriptionVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type OrgEventsSubscription = {
  __typename?: "Subscription";
  orgEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type SearchMessagesPageQueryVariables = Exact<{
  query: Scalars["String"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
}>;

export type SearchMessagesPageQuery = {
  __typename?: "Query";
  searchMessages: Array<{
    __typename?: "MessageSearchHit";
    id: string;
    chatId?: string | null;
    channelId?: string | null;
    sessionId?: string | null;
    sessionGroupId?: string | null;
    text: string;
    createdAt: string;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type SessionTimelineQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  beforeEventId?: InputMaybe<Scalars["ID"]["input"]>;
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type SessionTimelineQuery = {
  __typename?: "Query";
  sessionTimeline: {
    __typename?: "SessionTimelinePage";
    mode: SessionTimelineMode;
    hasOlder: boolean;
    items: Array<{
      __typename?: "SessionTimelineItem";
      id: string;
      kind: SessionTimelineItemKind;
      event?: {
        __typename?: "Event";
        id: string;
        scopeType: ScopeType;
        scopeId: string;
        eventType: EventType;
        payload: JsonValue;
        parentId?: string | null;
        timestamp: string;
        metadata?: JsonValue | null;
        actor: {
          __typename?: "Actor";
          type: ActorType;
          id: string;
          name?: string | null;
          avatarUrl?: string | null;
        };
      } | null;
      collapsed?: {
        __typename?: "CollapsedSessionEvents";
        id: string;
        startEventId: string;
        startTimestamp: string;
        endEventId: string;
        endTimestamp: string;
      } | null;
    }>;
  };
};

export type SessionEventsAroundEventQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
  eventId: Scalars["ID"]["input"];
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type SessionEventsAroundEventQuery = {
  __typename?: "Query";
  sessionEventsAroundEvent: Array<{
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type SessionEventsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  scope?: InputMaybe<ScopeInput>;
  limit?: InputMaybe<Scalars["Int"]["input"]>;
  after?: InputMaybe<Scalars["DateTime"]["input"]>;
  afterEventId?: InputMaybe<Scalars["ID"]["input"]>;
  before?: InputMaybe<Scalars["DateTime"]["input"]>;
  beforeEventId?: InputMaybe<Scalars["ID"]["input"]>;
  excludePayloadTypes?: InputMaybe<Array<Scalars["String"]["input"]> | Scalars["String"]["input"]>;
}>;

export type SessionEventsQuery = {
  __typename?: "Query";
  events: Array<{
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type SessionEventsLiveSubscriptionVariables = Exact<{
  sessionId: Scalars["ID"]["input"];
  organizationId: Scalars["ID"]["input"];
}>;

export type SessionEventsLiveSubscription = {
  __typename?: "Subscription";
  sessionEvents: {
    __typename?: "Event";
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    eventType: EventType;
    payload: JsonValue;
    parentId?: string | null;
    timestamp: string;
    metadata?: JsonValue | null;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  };
};

export type SessionPromptIndexQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  sessionId: Scalars["ID"]["input"];
}>;

export type SessionPromptIndexQuery = {
  __typename?: "Query";
  sessionPromptIndex: Array<{
    __typename?: "SessionPromptIndexItem";
    eventId: string;
    timestamp: string;
    preview: string;
    imageCount: number;
    actor: {
      __typename?: "Actor";
      type: ActorType;
      id: string;
      name?: string | null;
      avatarUrl?: string | null;
    };
  }>;
};

export type ChannelsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
  memberOnly?: InputMaybe<Scalars["Boolean"]["input"]>;
}>;

export type ChannelsQuery = {
  __typename?: "Query";
  channels: Array<{
    __typename?: "Channel";
    id: string;
    name: string;
    type: ChannelType;
    visibility: ChannelVisibility;
    position: number;
    groupId?: string | null;
    baseBranch?: string | null;
    setupScript?: string | null;
    runScripts?: JsonValue | null;
    viewerIsMember: boolean;
    repo?: { __typename?: "Repo"; id: string; name: string } | null;
  }>;
};

export type ChannelGroupsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type ChannelGroupsQuery = {
  __typename?: "Query";
  channelGroups: Array<{
    __typename?: "ChannelGroup";
    id: string;
    name: string;
    position: number;
    isCollapsed: boolean;
  }>;
};

export type ReposQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type ReposQuery = {
  __typename?: "Query";
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    provider: RepoProvider;
    remoteUrl?: string | null;
    defaultBranch: string;
    webhookActive: boolean;
  }>;
};

export type ChatsQueryVariables = Exact<{ [key: string]: never }>;

export type ChatsQuery = {
  __typename?: "Query";
  chats: Array<{
    __typename?: "Chat";
    id: string;
    type: ChatType;
    name?: string | null;
    createdAt: string;
    updatedAt: string;
    members: Array<{
      __typename?: "ChatMember";
      joinedAt: string;
      user: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    }>;
  }>;
};

export type InboxItemsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type InboxItemsQuery = {
  __typename?: "Query";
  inboxItems: Array<{
    __typename?: "InboxItem";
    id: string;
    itemType: InboxItemType;
    status: InboxItemStatus;
    title: string;
    summary?: string | null;
    payload: JsonValue;
    userId: string;
    sourceType: string;
    sourceId: string;
    createdAt: string;
    resolvedAt?: string | null;
  }>;
};

export type SidebarSessionGroupsQueryVariables = Exact<{
  channelId: Scalars["ID"]["input"];
  archived?: InputMaybe<Scalars["Boolean"]["input"]>;
  includeActiveMerged?: InputMaybe<Scalars["Boolean"]["input"]>;
}>;

export type SidebarSessionGroupsQuery = {
  __typename?: "Query";
  sessionGroups: Array<{
    __typename?: "SessionGroup";
    id: string;
    name: string;
    slug?: string | null;
    status: SessionGroupStatus;
    visibility: SessionGroupVisibility;
    prUrl?: string | null;
    worktreeDeleted: boolean;
    archivedAt?: string | null;
    setupStatus: SetupStatus;
    setupError?: string | null;
    branch?: string | null;
    workdir?: string | null;
    createdAt: string;
    updatedAt: string;
    owner: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
    channel?: { __typename?: "Channel"; id: string } | null;
    repo?: { __typename?: "Repo"; id: string; name: string } | null;
    connection?: {
      __typename?: "SessionConnection";
      state: SessionConnectionState;
      runtimeInstanceId?: string | null;
      runtimeLabel?: string | null;
      lastError?: string | null;
      retryCount: number;
      canRetry: boolean;
      canMove: boolean;
      autoRetryable?: boolean | null;
    } | null;
    sessions: Array<{
      __typename?: "Session";
      id: string;
      name: string;
      agentStatus: AgentStatus;
      sessionStatus: SessionStatus;
      tool: CodingTool;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting: HostingMode;
      branch?: string | null;
      workdir?: string | null;
      prUrl?: string | null;
      worktreeDeleted: boolean;
      sessionGroupId?: string | null;
      lastUserMessageAt?: string | null;
      lastMessageAt?: string | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      costUsd: number;
      createdAt: string;
      updatedAt: string;
      connection?: {
        __typename?: "SessionConnection";
        state: SessionConnectionState;
        runtimeInstanceId?: string | null;
        runtimeLabel?: string | null;
        lastError?: string | null;
        retryCount: number;
        canRetry: boolean;
        canMove: boolean;
        autoRetryable?: boolean | null;
      } | null;
      createdBy: { __typename?: "User"; id: string; name: string; avatarUrl?: string | null };
      repo?: { __typename?: "Repo"; id: string; name: string } | null;
      channel?: { __typename?: "Channel"; id: string } | null;
    }>;
  }>;
};

export type OnboardingReposQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type OnboardingReposQuery = {
  __typename?: "Query";
  repos: Array<{
    __typename?: "Repo";
    id: string;
    name: string;
    provider: RepoProvider;
    remoteUrl?: string | null;
    defaultBranch: string;
    webhookActive: boolean;
  }>;
};

export type OnboardingSessionsQueryVariables = Exact<{
  organizationId: Scalars["ID"]["input"];
}>;

export type OnboardingSessionsQuery = {
  __typename?: "Query";
  sessions: Array<{ __typename?: "Session"; id: string }>;
};

export const SendChannelMessageDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SendChannelMessage" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "html" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sendChannelMessage" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "html" },
                value: { kind: "Variable", name: { kind: "Name", value: "html" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentId" },
                value: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SendChannelMessageMutation, SendChannelMessageMutationVariables>;
export const ChannelMembersDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ChannelMembers" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "members" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "user" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "email" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChannelMembersQuery, ChannelMembersQueryVariables>;
export const AddChannelMemberDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "AddChannelMember" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "AddChannelMemberInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "addChannelMember" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddChannelMemberMutation, AddChannelMemberMutationVariables>;
export const SessionGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "archived" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "archived" },
                value: { kind: "Variable", name: { kind: "Name", value: "archived" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "slug" } },
                { kind: "Field", name: { kind: "Name", value: "forkedFromSessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "visibility" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "owner" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "archivedAt" } },
                { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                { kind: "Field", name: { kind: "Name", value: "setupError" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                      { kind: "Field", name: { kind: "Name", value: "hosting" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "workdir" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      { kind: "Field", name: { kind: "Name", value: "lastUserMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheReadTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheCreationTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "costUsd" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "createdBy" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupsQuery, SessionGroupsQueryVariables>;
export const FilteredSessionGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "FilteredSessionGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "archived" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "status" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "SessionGroupStatus" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "archived" },
                value: { kind: "Variable", name: { kind: "Name", value: "archived" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "status" },
                value: { kind: "Variable", name: { kind: "Name", value: "status" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "forkedFromSessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "visibility" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "owner" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "archivedAt" } },
                { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                { kind: "Field", name: { kind: "Name", value: "setupError" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                      { kind: "Field", name: { kind: "Name", value: "hosting" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "workdir" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      { kind: "Field", name: { kind: "Name", value: "lastUserMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheReadTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheCreationTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "costUsd" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "createdBy" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<FilteredSessionGroupsQuery, FilteredSessionGroupsQueryVariables>;
export const AddChatMemberDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "AddChatMember" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "AddChatMemberInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "addChatMember" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddChatMemberMutation, AddChatMemberMutationVariables>;
export const SendChatMessageDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SendChatMessage" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "html" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "clientMutationId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sendChatMessage" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "html" },
                value: { kind: "Variable", name: { kind: "Name", value: "html" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "parentId" },
                value: { kind: "Variable", name: { kind: "Name", value: "parentId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "clientMutationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "clientMutationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SendChatMessageMutation, SendChatMessageMutationVariables>;
export const RenameChatDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RenameChat" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "name" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "renameChat" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "name" },
                value: { kind: "Variable", name: { kind: "Name", value: "name" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RenameChatMutation, RenameChatMutationVariables>;
export const ThreadRepliesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ThreadReplies" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "rootMessageId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "threadReplies" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "rootMessageId" },
                value: { kind: "Variable", name: { kind: "Name", value: "rootMessageId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "chatId" } },
                { kind: "Field", name: { kind: "Name", value: "channelId" } },
                { kind: "Field", name: { kind: "Name", value: "text" } },
                { kind: "Field", name: { kind: "Name", value: "html" } },
                { kind: "Field", name: { kind: "Name", value: "mentions" } },
                { kind: "Field", name: { kind: "Name", value: "parentMessageId" } },
                { kind: "Field", name: { kind: "Name", value: "replyCount" } },
                { kind: "Field", name: { kind: "Name", value: "latestReplyAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "threadRepliers" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                { kind: "Field", name: { kind: "Name", value: "editedAt" } },
                { kind: "Field", name: { kind: "Name", value: "deletedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ThreadRepliesQuery, ThreadRepliesQueryVariables>;
export const SessionGroupBranchDiffDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupBranchDiff" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupBranchDiff" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "path" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "additions" } },
                { kind: "Field", name: { kind: "Name", value: "deletions" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupBranchDiffQuery, SessionGroupBranchDiffQueryVariables>;
export const SessionGroupWorktreeChangesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupWorktreeChanges" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupWorktreeChanges" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "files" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "path" } },
                      { kind: "Field", name: { kind: "Name", value: "status" } },
                      { kind: "Field", name: { kind: "Name", value: "additions" } },
                      { kind: "Field", name: { kind: "Name", value: "deletions" } },
                      { kind: "Field", name: { kind: "Name", value: "diff" } },
                      { kind: "Field", name: { kind: "Name", value: "truncated" } },
                      { kind: "Field", name: { kind: "Name", value: "originalContent" } },
                      { kind: "Field", name: { kind: "Name", value: "modifiedContent" } },
                      { kind: "Field", name: { kind: "Name", value: "contentTruncated" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "totalCount" } },
                { kind: "Field", name: { kind: "Name", value: "truncated" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionGroupWorktreeChangesQuery,
  SessionGroupWorktreeChangesQueryVariables
>;
export const RevertSessionGroupFileChangeDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RevertSessionGroupFileChange" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "revertSessionGroupFileChange" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RevertSessionGroupFileChangeMutation,
  RevertSessionGroupFileChangeMutationVariables
>;
export const SessionGroupFileAtRefDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFileAtRef" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "ref" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFileAtRef" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "ref" },
                value: { kind: "Variable", name: { kind: "Name", value: "ref" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupFileAtRefQuery, SessionGroupFileAtRefQueryVariables>;
export const SessionGroupFileContentForDiffDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFileContentForDiff" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFileContent" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionGroupFileContentForDiffQuery,
  SessionGroupFileContentForDiffQueryVariables
>;
export const SessionGroupFileContentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFileContent" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFileContentWithSource" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "content" } },
                { kind: "Field", name: { kind: "Name", value: "ref" } },
                { kind: "Field", name: { kind: "Name", value: "requestedRef" } },
                { kind: "Field", name: { kind: "Name", value: "usedFallback" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupFileContentQuery, SessionGroupFileContentQueryVariables>;
export const SaveSessionGroupFileDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SaveSessionGroupFile" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "content" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "saveSessionGroupFile" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "filePath" },
                value: { kind: "Variable", name: { kind: "Name", value: "filePath" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "content" },
                value: { kind: "Variable", name: { kind: "Name", value: "content" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SaveSessionGroupFileMutation, SaveSessionGroupFileMutationVariables>;
export const CommitSessionGroupFileChangesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CommitSessionGroupFileChanges" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "message" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "commitSessionGroupFileChanges" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "message" },
                value: { kind: "Variable", name: { kind: "Name", value: "message" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CommitSessionGroupFileChangesMutation,
  CommitSessionGroupFileChangesMutationVariables
>;
export const SessionGroupWorktreeChangesForCommitButtonDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupWorktreeChangesForCommitButton" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupWorktreeChanges" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "totalCount" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionGroupWorktreeChangesForCommitButtonQuery,
  SessionGroupWorktreeChangesForCommitButtonQueryVariables
>;
export const SessionDetailDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionDetail" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "session" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                { kind: "Field", name: { kind: "Name", value: "tool" } },
                { kind: "Field", name: { kind: "Name", value: "model" } },
                { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                { kind: "Field", name: { kind: "Name", value: "hosting" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "branch" } },
                { kind: "Field", name: { kind: "Name", value: "workdir" } },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "lastUserMessageAt" } },
                { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                { kind: "Field", name: { kind: "Name", value: "cacheReadTokens" } },
                { kind: "Field", name: { kind: "Name", value: "cacheCreationTokens" } },
                { kind: "Field", name: { kind: "Name", value: "costUsd" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "connection" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "state" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                      { kind: "Field", name: { kind: "Name", value: "lastError" } },
                      { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                      { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                      { kind: "Field", name: { kind: "Name", value: "canMove" } },
                      { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdBy" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessionGroup" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "workdir" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "gitCheckpoints" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                            { kind: "Field", name: { kind: "Name", value: "promptEventId" } },
                            { kind: "Field", name: { kind: "Name", value: "commitSha" } },
                            { kind: "Field", name: { kind: "Name", value: "subject" } },
                            { kind: "Field", name: { kind: "Name", value: "author" } },
                            { kind: "Field", name: { kind: "Name", value: "committedAt" } },
                            { kind: "Field", name: { kind: "Name", value: "filesChanged" } },
                            { kind: "Field", name: { kind: "Name", value: "captureStatus" } },
                            { kind: "Field", name: { kind: "Name", value: "captureUrl" } },
                            { kind: "Field", name: { kind: "Name", value: "capturedAt" } },
                            { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "applicationConfig" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "setupScripts" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        { kind: "Field", name: { kind: "Name", value: "id" } },
                                        { kind: "Field", name: { kind: "Name", value: "name" } },
                                        { kind: "Field", name: { kind: "Name", value: "command" } },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "workingDirectory" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "env" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "key" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "secretName" },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "applications" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        { kind: "Field", name: { kind: "Name", value: "id" } },
                                        { kind: "Field", name: { kind: "Name", value: "name" } },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "processes" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "id" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "name" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "command" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "workingDirectory" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "env" },
                                                selectionSet: {
                                                  kind: "SelectionSet",
                                                  selections: [
                                                    {
                                                      kind: "Field",
                                                      name: { kind: "Name", value: "key" },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: { kind: "Name", value: "secretName" },
                                                    },
                                                  ],
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "required" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "ports" },
                                                selectionSet: {
                                                  kind: "SelectionSet",
                                                  selections: [
                                                    {
                                                      kind: "Field",
                                                      name: { kind: "Name", value: "id" },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: { kind: "Name", value: "label" },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: { kind: "Name", value: "port" },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: { kind: "Name", value: "protocol" },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: {
                                                        kind: "Name",
                                                        value: "defaultForwardingEnabled",
                                                      },
                                                    },
                                                    {
                                                      kind: "Field",
                                                      name: { kind: "Name", value: "healthPath" },
                                                    },
                                                  ],
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "setupError" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "gitCheckpoints" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                      { kind: "Field", name: { kind: "Name", value: "promptEventId" } },
                      { kind: "Field", name: { kind: "Name", value: "commitSha" } },
                      { kind: "Field", name: { kind: "Name", value: "subject" } },
                      { kind: "Field", name: { kind: "Name", value: "author" } },
                      { kind: "Field", name: { kind: "Name", value: "committedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "filesChanged" } },
                      { kind: "Field", name: { kind: "Name", value: "captureStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "captureUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "capturedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "queuedMessages" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                      { kind: "Field", name: { kind: "Name", value: "text" } },
                      {
                        kind: "Field",
                        alias: { kind: "Name", value: "imageKeys" },
                        name: { kind: "Name", value: "attachmentKeys" },
                      },
                      { kind: "Field", name: { kind: "Name", value: "interactionMode" } },
                      { kind: "Field", name: { kind: "Name", value: "position" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionDetailQuery, SessionDetailQueryVariables>;
export const SessionGroupDetailDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupDetail" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "kind" } },
                { kind: "Field", name: { kind: "Name", value: "slug" } },
                { kind: "Field", name: { kind: "Name", value: "forkedFromSessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "visibility" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "owner" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "archivedAt" } },
                { kind: "Field", name: { kind: "Name", value: "branch" } },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "workdir" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeAdopted" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "gitCheckpoints" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                      { kind: "Field", name: { kind: "Name", value: "promptEventId" } },
                      { kind: "Field", name: { kind: "Name", value: "commitSha" } },
                      { kind: "Field", name: { kind: "Name", value: "subject" } },
                      { kind: "Field", name: { kind: "Name", value: "author" } },
                      { kind: "Field", name: { kind: "Name", value: "committedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "filesChanged" } },
                      { kind: "Field", name: { kind: "Name", value: "captureStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "captureUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "capturedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "connection" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "state" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                      { kind: "Field", name: { kind: "Name", value: "lastError" } },
                      { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                      { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                      { kind: "Field", name: { kind: "Name", value: "canMove" } },
                      { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                { kind: "Field", name: { kind: "Name", value: "setupError" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                      { kind: "Field", name: { kind: "Name", value: "hosting" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "workdir" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      { kind: "Field", name: { kind: "Name", value: "lastUserMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheReadTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheCreationTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "costUsd" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "createdBy" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupDetailQuery, SessionGroupDetailQueryVariables>;
export const AppPreviewStateDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AppPreviewState" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionEndpoints" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "appConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "processConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "portConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "label" } },
                { kind: "Field", name: { kind: "Name", value: "targetPort" } },
                { kind: "Field", name: { kind: "Name", value: "url" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "accessMode" } },
                { kind: "Field", name: { kind: "Name", value: "trafficCaptureMode" } },
                { kind: "Field", name: { kind: "Name", value: "enabledAt" } },
                { kind: "Field", name: { kind: "Name", value: "disabledAt" } },
                { kind: "Field", name: { kind: "Name", value: "revokedAt" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionApplicationProcesses" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "appConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "processConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "label" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                { kind: "Field", name: { kind: "Name", value: "startedAt" } },
                { kind: "Field", name: { kind: "Name", value: "stoppedAt" } },
                { kind: "Field", name: { kind: "Name", value: "exitCode" } },
                { kind: "Field", name: { kind: "Name", value: "lastError" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AppPreviewStateQuery, AppPreviewStateQueryVariables>;
export const StartSessionApplicationWorkflowDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "StartSessionApplicationWorkflow" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "appConfigId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "startSessionApplicationWorkflow" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "appConfigId" },
                value: { kind: "Variable", name: { kind: "Name", value: "appConfigId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  StartSessionApplicationWorkflowMutation,
  StartSessionApplicationWorkflowMutationVariables
>;
export const SessionEndpointTrafficEndpointsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionEndpointTrafficEndpoints" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionEndpoints" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "key" } },
                { kind: "Field", name: { kind: "Name", value: "url" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "appConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "processConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "portConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "label" } },
                { kind: "Field", name: { kind: "Name", value: "targetPort" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "accessMode" } },
                { kind: "Field", name: { kind: "Name", value: "trafficCaptureMode" } },
                { kind: "Field", name: { kind: "Name", value: "enabledAt" } },
                { kind: "Field", name: { kind: "Name", value: "disabledAt" } },
                { kind: "Field", name: { kind: "Name", value: "revokedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionEndpointTrafficEndpointsQuery,
  SessionEndpointTrafficEndpointsQueryVariables
>;
export const EndpointTrafficTabDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "EndpointTrafficTab" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "endpointTraffic" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "endpointId" },
                value: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "endpointId" } },
                { kind: "Field", name: { kind: "Name", value: "startedAt" } },
                { kind: "Field", name: { kind: "Name", value: "durationMs" } },
                { kind: "Field", name: { kind: "Name", value: "requestMethod" } },
                { kind: "Field", name: { kind: "Name", value: "requestPath" } },
                { kind: "Field", name: { kind: "Name", value: "responseStatus" } },
                { kind: "Field", name: { kind: "Name", value: "error" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<EndpointTrafficTabQuery, EndpointTrafficTabQueryVariables>;
export const ClearEndpointTrafficTabDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ClearEndpointTrafficTab" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "clearEndpointTraffic" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "endpointId" },
                value: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ClearEndpointTrafficTabMutation,
  ClearEndpointTrafficTabMutationVariables
>;
export const SessionApplicationsStateDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionApplicationsState" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "applicationConfig" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "setupScripts" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  { kind: "Field", name: { kind: "Name", value: "id" } },
                                  { kind: "Field", name: { kind: "Name", value: "name" } },
                                  { kind: "Field", name: { kind: "Name", value: "command" } },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "workingDirectory" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "env" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        { kind: "Field", name: { kind: "Name", value: "key" } },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "secretName" },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "applications" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  { kind: "Field", name: { kind: "Name", value: "id" } },
                                  { kind: "Field", name: { kind: "Name", value: "name" } },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "processes" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        { kind: "Field", name: { kind: "Name", value: "id" } },
                                        { kind: "Field", name: { kind: "Name", value: "name" } },
                                        { kind: "Field", name: { kind: "Name", value: "command" } },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "workingDirectory" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "env" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "key" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "secretName" },
                                              },
                                            ],
                                          },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "required" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "ports" },
                                          selectionSet: {
                                            kind: "SelectionSet",
                                            selections: [
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "id" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "label" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "port" },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "protocol" },
                                              },
                                              {
                                                kind: "Field",
                                                name: {
                                                  kind: "Name",
                                                  value: "defaultForwardingEnabled",
                                                },
                                              },
                                              {
                                                kind: "Field",
                                                name: { kind: "Name", value: "healthPath" },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionApplicationProcesses" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "appConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "processConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "label" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                { kind: "Field", name: { kind: "Name", value: "startedAt" } },
                { kind: "Field", name: { kind: "Name", value: "stoppedAt" } },
                { kind: "Field", name: { kind: "Name", value: "exitCode" } },
                { kind: "Field", name: { kind: "Name", value: "lastError" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionSetupScriptRuns" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "scriptConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "label" } },
                { kind: "Field", name: { kind: "Name", value: "command" } },
                { kind: "Field", name: { kind: "Name", value: "workingDirectory" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "exitCode" } },
                { kind: "Field", name: { kind: "Name", value: "outputPreview" } },
                { kind: "Field", name: { kind: "Name", value: "outputTruncated" } },
                { kind: "Field", name: { kind: "Name", value: "lastError" } },
                { kind: "Field", name: { kind: "Name", value: "startedAt" } },
                { kind: "Field", name: { kind: "Name", value: "completedAt" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionApplicationWorkflowRuns" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "appConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "lastError" } },
                { kind: "Field", name: { kind: "Name", value: "startedAt" } },
                { kind: "Field", name: { kind: "Name", value: "completedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "steps" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "stepId" } },
                      { kind: "Field", name: { kind: "Name", value: "kind" } },
                      { kind: "Field", name: { kind: "Name", value: "label" } },
                      { kind: "Field", name: { kind: "Name", value: "status" } },
                      { kind: "Field", name: { kind: "Name", value: "dependsOn" } },
                      { kind: "Field", name: { kind: "Name", value: "optional" } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionEndpoints" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "key" } },
                { kind: "Field", name: { kind: "Name", value: "url" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "appConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "processConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "portConfigId" } },
                { kind: "Field", name: { kind: "Name", value: "label" } },
                { kind: "Field", name: { kind: "Name", value: "targetPort" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "accessMode" } },
                { kind: "Field", name: { kind: "Name", value: "trafficCaptureMode" } },
                { kind: "Field", name: { kind: "Name", value: "enabledAt" } },
                { kind: "Field", name: { kind: "Name", value: "disabledAt" } },
                { kind: "Field", name: { kind: "Name", value: "revokedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionApplicationsStateQuery, SessionApplicationsStateQueryVariables>;
export const SessionApplicationProcessLogsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionApplicationProcessLogs" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "processId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionApplicationLogs" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "processId" },
                value: { kind: "Variable", name: { kind: "Name", value: "processId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "processId" } },
                { kind: "Field", name: { kind: "Name", value: "stream" } },
                { kind: "Field", name: { kind: "Name", value: "data" } },
                { kind: "Field", name: { kind: "Name", value: "sequence" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionApplicationProcessLogsQuery,
  SessionApplicationProcessLogsQueryVariables
>;
export const RunSessionGroupSetupScriptDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RunSessionGroupSetupScript" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "scriptId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "runSessionGroupSetupScript" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "scriptId" },
                value: { kind: "Variable", name: { kind: "Name", value: "scriptId" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RunSessionGroupSetupScriptMutation,
  RunSessionGroupSetupScriptMutationVariables
>;
export const StartSessionProcessDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "StartSessionProcess" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "appConfigId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "processConfigId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "startSessionProcess" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "appConfigId" },
                value: { kind: "Variable", name: { kind: "Name", value: "appConfigId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "processConfigId" },
                value: { kind: "Variable", name: { kind: "Name", value: "processConfigId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StartSessionProcessMutation, StartSessionProcessMutationVariables>;
export const StopSessionProcessDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "StopSessionProcess" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "appConfigId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "processConfigId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "stopSessionProcess" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "appConfigId" },
                value: { kind: "Variable", name: { kind: "Name", value: "appConfigId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "processConfigId" },
                value: { kind: "Variable", name: { kind: "Name", value: "processConfigId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StopSessionProcessMutation, StopSessionProcessMutationVariables>;
export const EnableSessionEndpointForwardingDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "EnableSessionEndpointForwarding" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "accessMode" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "SessionEndpointAccessMode" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "enableSessionEndpointForwarding" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "endpointId" },
                value: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "accessMode" },
                value: { kind: "Variable", name: { kind: "Name", value: "accessMode" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  EnableSessionEndpointForwardingMutation,
  EnableSessionEndpointForwardingMutationVariables
>;
export const DisableSessionEndpointForwardingDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DisableSessionEndpointForwarding" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "disableSessionEndpointForwarding" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "endpointId" },
                value: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DisableSessionEndpointForwardingMutation,
  DisableSessionEndpointForwardingMutationVariables
>;
export const PublishAppSessionDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "PublishAppSession" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "publishAppSession" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PublishAppSessionMutation, PublishAppSessionMutationVariables>;
export const CreateSessionEndpointPreviewDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateSessionEndpointPreview" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createSessionEndpointPreview" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "endpointId" },
                value: { kind: "Variable", name: { kind: "Name", value: "endpointId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "url" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateSessionEndpointPreviewMutation,
  CreateSessionEndpointPreviewMutationVariables
>;
export const SessionGroupFileTreeDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFileTree" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFileTree" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "paths" } },
                { kind: "Field", name: { kind: "Name", value: "truncated" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupFileTreeQuery, SessionGroupFileTreeQueryVariables>;
export const SessionGroupDirectoryEntriesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupDirectoryEntries" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "directoryPath" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "depth" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupDirectoryEntries" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "directoryPath" },
                value: { kind: "Variable", name: { kind: "Name", value: "directoryPath" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "depth" },
                value: { kind: "Variable", name: { kind: "Name", value: "depth" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "path" } },
                { kind: "Field", name: { kind: "Name", value: "isDirectory" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SessionGroupDirectoryEntriesQuery,
  SessionGroupDirectoryEntriesQueryVariables
>;
export const SessionGroupFilesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionGroupFiles" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroupFiles" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionGroupId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionGroupId" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionGroupFilesQuery, SessionGroupFilesQueryVariables>;
export const MyApiTokensDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "MyApiTokens" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "myApiTokens" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "isSet" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MyApiTokensQuery, MyApiTokensQueryVariables>;
export const SetApiTokenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SetApiToken" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "SetApiTokenInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "setApiToken" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "isSet" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetApiTokenMutation, SetApiTokenMutationVariables>;
export const DeleteApiTokenDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteApiToken" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "provider" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ApiTokenProvider" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteApiToken" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "provider" },
                value: { kind: "Variable", name: { kind: "Name", value: "provider" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteApiTokenMutation, DeleteApiTokenMutationVariables>;
export const AddOrgMemberDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "AddOrgMember" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "userId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "role" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "UserRole" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "addOrgMember" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "userId" },
                value: { kind: "Variable", name: { kind: "Name", value: "userId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "role" },
                value: { kind: "Variable", name: { kind: "Name", value: "role" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "user" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "email" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "role" } },
                { kind: "Field", name: { kind: "Name", value: "joinedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddOrgMemberMutation, AddOrgMemberMutationVariables>;
export const RemoveOrgMemberDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "RemoveOrgMember" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "userId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "removeOrgMember" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "userId" },
                value: { kind: "Variable", name: { kind: "Name", value: "userId" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RemoveOrgMemberMutation, RemoveOrgMemberMutationVariables>;
export const UpdateOrgMemberRoleDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateOrgMemberRole" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "userId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "role" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UserRole" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateOrgMemberRole" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "userId" },
                value: { kind: "Variable", name: { kind: "Name", value: "userId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "role" },
                value: { kind: "Variable", name: { kind: "Name", value: "role" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "user" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "role" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateOrgMemberRoleMutation, UpdateOrgMemberRoleMutationVariables>;
export const SearchUsersDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SearchUsers" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "query" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "searchUsers" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "query" },
                value: { kind: "Variable", name: { kind: "Name", value: "query" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "email" } },
                { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SearchUsersQuery, SearchUsersQueryVariables>;
export const SettingsReposDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SettingsRepos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "applicationConfig" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "setupScripts" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "command" } },
                            { kind: "Field", name: { kind: "Name", value: "workingDirectory" } },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "env" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  { kind: "Field", name: { kind: "Name", value: "key" } },
                                  { kind: "Field", name: { kind: "Name", value: "secretName" } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "applications" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "processes" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  { kind: "Field", name: { kind: "Name", value: "id" } },
                                  { kind: "Field", name: { kind: "Name", value: "name" } },
                                  { kind: "Field", name: { kind: "Name", value: "command" } },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "workingDirectory" },
                                  },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "env" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        { kind: "Field", name: { kind: "Name", value: "key" } },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "secretName" },
                                        },
                                      ],
                                    },
                                  },
                                  { kind: "Field", name: { kind: "Name", value: "required" } },
                                  {
                                    kind: "Field",
                                    name: { kind: "Name", value: "ports" },
                                    selectionSet: {
                                      kind: "SelectionSet",
                                      selections: [
                                        { kind: "Field", name: { kind: "Name", value: "id" } },
                                        { kind: "Field", name: { kind: "Name", value: "label" } },
                                        { kind: "Field", name: { kind: "Name", value: "port" } },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "protocol" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "defaultForwardingEnabled" },
                                        },
                                        {
                                          kind: "Field",
                                          name: { kind: "Name", value: "healthPath" },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SettingsReposQuery, SettingsReposQueryVariables>;
export const AgentEnvironmentsSettingsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AgentEnvironmentsSettings" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "agentEnvironments" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "adapterType" } },
                { kind: "Field", name: { kind: "Name", value: "config" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "isDefault" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "orgSecrets" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
          {
            kind: "Field",
            name: { kind: "Name", value: "myConnections" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                {
                  kind: "Field",
                  name: { kind: "Name", value: "bridge" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "instanceId" } },
                      { kind: "Field", name: { kind: "Name", value: "label" } },
                      { kind: "Field", name: { kind: "Name", value: "hostingMode" } },
                      { kind: "Field", name: { kind: "Name", value: "connected" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repos" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AgentEnvironmentsSettingsQuery,
  AgentEnvironmentsSettingsQueryVariables
>;
export const OrgSecretsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "OrgSecrets" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "orgSecrets" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OrgSecretsQuery, OrgSecretsQueryVariables>;
export const CreateAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "CreateAgentEnvironmentInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "adapterType" } },
                { kind: "Field", name: { kind: "Name", value: "config" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "isDefault" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateAgentEnvironmentMutation,
  CreateAgentEnvironmentMutationVariables
>;
export const UpdateAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "UpdateAgentEnvironmentInput" },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "adapterType" } },
                { kind: "Field", name: { kind: "Name", value: "config" } },
                { kind: "Field", name: { kind: "Name", value: "enabled" } },
                { kind: "Field", name: { kind: "Name", value: "isDefault" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateAgentEnvironmentMutation,
  UpdateAgentEnvironmentMutationVariables
>;
export const DeleteAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteAgentEnvironmentMutation,
  DeleteAgentEnvironmentMutationVariables
>;
export const TestAgentEnvironmentDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "TestAgentEnvironment" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "testAgentEnvironment" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "ok" } },
                { kind: "Field", name: { kind: "Name", value: "message" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TestAgentEnvironmentMutation, TestAgentEnvironmentMutationVariables>;
export const SetOrgSecretDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "SetOrgSecret" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "SetOrgSecretInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "setOrgSecret" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "orgId" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetOrgSecretMutation, SetOrgSecretMutationVariables>;
export const DeleteOrgSecretDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteOrgSecret" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteOrgSecret" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "orgId" },
                value: { kind: "Variable", name: { kind: "Name", value: "orgId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteOrgSecretMutation, DeleteOrgSecretMutationVariables>;
export const CreateRepoDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateRepo" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateRepoInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createRepo" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateRepoMutation, CreateRepoMutationVariables>;
export const CreateDmDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateDM" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChatInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChat" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateDmMutation, CreateDmMutationVariables>;
export const AppSessionGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AppSessionGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "appSessionGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "slug" } },
                { kind: "Field", name: { kind: "Name", value: "kind" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "visibility" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "connection" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "state" } }],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "lastUserMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AppSessionGroupsQuery, AppSessionGroupsQueryVariables>;
export const AllChannelsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "AllChannels" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channels" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "type" } },
                { kind: "Field", name: { kind: "Name", value: "visibility" } },
                { kind: "Field", name: { kind: "Name", value: "memberCount" } },
                { kind: "Field", name: { kind: "Name", value: "viewerIsMember" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AllChannelsQuery, AllChannelsQueryVariables>;
export const JoinChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "JoinChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "joinChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<JoinChannelMutation, JoinChannelMutationVariables>;
export const LeaveChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "LeaveChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "leaveChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LeaveChannelMutation, LeaveChannelMutationVariables>;
export const UpdateChannelGroupCollapseDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateChannelGroupCollapse" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateChannelGroupInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateChannelGroupCollapseMutation,
  UpdateChannelGroupCollapseMutationVariables
>;
export const CreateChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChannelInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateChannelMutation, CreateChannelMutationVariables>;
export const CreateChannelGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateChannelGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChannelGroupInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateChannelGroupMutation, CreateChannelGroupMutationVariables>;
export const CreateChatDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "CreateChat" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "CreateChatInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "createChat" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateChatMutation, CreateChatMutationVariables>;
export const DeleteChannelGroupDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "DeleteChannelGroup" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "deleteChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteChannelGroupMutation, DeleteChannelGroupMutationVariables>;
export const TicketsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Tickets" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "tickets" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "description" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "priority" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "assignees" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "labels" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "createdBy" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TicketsQuery, TicketsQueryVariables>;
export const MoveChannelDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "MoveChannel" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "MoveChannelInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "moveChannel" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MoveChannelMutation, MoveChannelMutationVariables>;
export const UpdateChannelGroupPositionDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "UpdateChannelGroupPosition" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "id" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "UpdateChannelGroupInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "updateChannelGroup" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "id" },
                value: { kind: "Variable", name: { kind: "Name", value: "id" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateChannelGroupPositionMutation,
  UpdateChannelGroupPositionMutationVariables
>;
export const ReorderChannelsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "mutation",
      name: { kind: "Name", value: "ReorderChannels" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "input" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ReorderChannelsInput" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "reorderChannels" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "input" },
                value: { kind: "Variable", name: { kind: "Name", value: "input" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReorderChannelsMutation, ReorderChannelsMutationVariables>;
export const ChannelMessagesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ChannelMessages" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "before" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channelMessages" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "before" },
                value: { kind: "Variable", name: { kind: "Name", value: "before" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "chatId" } },
                { kind: "Field", name: { kind: "Name", value: "channelId" } },
                { kind: "Field", name: { kind: "Name", value: "text" } },
                { kind: "Field", name: { kind: "Name", value: "html" } },
                { kind: "Field", name: { kind: "Name", value: "mentions" } },
                { kind: "Field", name: { kind: "Name", value: "parentMessageId" } },
                { kind: "Field", name: { kind: "Name", value: "replyCount" } },
                { kind: "Field", name: { kind: "Name", value: "latestReplyAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "threadRepliers" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                { kind: "Field", name: { kind: "Name", value: "editedAt" } },
                { kind: "Field", name: { kind: "Name", value: "deletedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChannelMessagesQuery, ChannelMessagesQueryVariables>;
export const ChannelEventsForMessagesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "ChannelEventsForMessages" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "types" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channelEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "types" },
                value: { kind: "Variable", name: { kind: "Name", value: "types" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ChannelEventsForMessagesSubscription,
  ChannelEventsForMessagesSubscriptionVariables
>;
export const ChatMessagesDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ChatMessages" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "before" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "chatMessages" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "before" },
                value: { kind: "Variable", name: { kind: "Name", value: "before" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "chatId" } },
                { kind: "Field", name: { kind: "Name", value: "text" } },
                { kind: "Field", name: { kind: "Name", value: "html" } },
                { kind: "Field", name: { kind: "Name", value: "mentions" } },
                { kind: "Field", name: { kind: "Name", value: "parentMessageId" } },
                { kind: "Field", name: { kind: "Name", value: "replyCount" } },
                { kind: "Field", name: { kind: "Name", value: "latestReplyAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "threadRepliers" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                { kind: "Field", name: { kind: "Name", value: "editedAt" } },
                { kind: "Field", name: { kind: "Name", value: "deletedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChatMessagesQuery, ChatMessagesQueryVariables>;
export const ChatEventsSubscriptionDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "ChatEventsSubscription" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "types" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "chatEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "chatId" },
                value: { kind: "Variable", name: { kind: "Name", value: "chatId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "types" },
                value: { kind: "Variable", name: { kind: "Name", value: "types" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ChatEventsSubscriptionSubscription,
  ChatEventsSubscriptionSubscriptionVariables
>;
export const OrgEventsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "OrgEvents" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "orgEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OrgEventsSubscription, OrgEventsSubscriptionVariables>;
export const SearchMessagesPageDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SearchMessagesPage" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "query" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "searchMessages" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "query" },
                value: { kind: "Variable", name: { kind: "Name", value: "query" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "chatId" } },
                { kind: "Field", name: { kind: "Name", value: "channelId" } },
                { kind: "Field", name: { kind: "Name", value: "sessionId" } },
                { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                { kind: "Field", name: { kind: "Name", value: "text" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SearchMessagesPageQuery, SearchMessagesPageQueryVariables>;
export const SessionTimelineDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionTimeline" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "before" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "beforeEventId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionTimeline" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "before" },
                value: { kind: "Variable", name: { kind: "Name", value: "before" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "beforeEventId" },
                value: { kind: "Variable", name: { kind: "Name", value: "beforeEventId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "excludePayloadTypes" },
                value: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "mode" } },
                { kind: "Field", name: { kind: "Name", value: "hasOlder" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "items" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "kind" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "event" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                            { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                            { kind: "Field", name: { kind: "Name", value: "eventType" } },
                            { kind: "Field", name: { kind: "Name", value: "payload" } },
                            {
                              kind: "Field",
                              name: { kind: "Name", value: "actor" },
                              selectionSet: {
                                kind: "SelectionSet",
                                selections: [
                                  { kind: "Field", name: { kind: "Name", value: "type" } },
                                  { kind: "Field", name: { kind: "Name", value: "id" } },
                                  { kind: "Field", name: { kind: "Name", value: "name" } },
                                  { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                                ],
                              },
                            },
                            { kind: "Field", name: { kind: "Name", value: "parentId" } },
                            { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                            { kind: "Field", name: { kind: "Name", value: "metadata" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "collapsed" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "startEventId" } },
                            { kind: "Field", name: { kind: "Name", value: "startTimestamp" } },
                            { kind: "Field", name: { kind: "Name", value: "endEventId" } },
                            { kind: "Field", name: { kind: "Name", value: "endTimestamp" } },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionTimelineQuery, SessionTimelineQueryVariables>;
export const SessionEventsAroundEventDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionEventsAroundEvent" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "eventId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionEventsAroundEvent" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "eventId" },
                value: { kind: "Variable", name: { kind: "Name", value: "eventId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "excludePayloadTypes" },
                value: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionEventsAroundEventQuery, SessionEventsAroundEventQueryVariables>;
export const SessionEventsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionEvents" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "scope" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ScopeInput" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "limit" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Int" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "after" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "afterEventId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "before" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "DateTime" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "beforeEventId" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
          type: {
            kind: "ListType",
            type: {
              kind: "NonNullType",
              type: { kind: "NamedType", name: { kind: "Name", value: "String" } },
            },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "events" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "scope" },
                value: { kind: "Variable", name: { kind: "Name", value: "scope" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "limit" },
                value: { kind: "Variable", name: { kind: "Name", value: "limit" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "after" },
                value: { kind: "Variable", name: { kind: "Name", value: "after" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "afterEventId" },
                value: { kind: "Variable", name: { kind: "Name", value: "afterEventId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "before" },
                value: { kind: "Variable", name: { kind: "Name", value: "before" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "beforeEventId" },
                value: { kind: "Variable", name: { kind: "Name", value: "beforeEventId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "excludePayloadTypes" },
                value: { kind: "Variable", name: { kind: "Name", value: "excludePayloadTypes" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionEventsQuery, SessionEventsQueryVariables>;
export const SessionEventsLiveDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "subscription",
      name: { kind: "Name", value: "SessionEventsLive" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionEvents" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "scopeType" } },
                { kind: "Field", name: { kind: "Name", value: "scopeId" } },
                { kind: "Field", name: { kind: "Name", value: "eventType" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "parentId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                { kind: "Field", name: { kind: "Name", value: "metadata" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionEventsLiveSubscription, SessionEventsLiveSubscriptionVariables>;
export const SessionPromptIndexDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SessionPromptIndex" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionPromptIndex" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "sessionId" },
                value: { kind: "Variable", name: { kind: "Name", value: "sessionId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "eventId" } },
                { kind: "Field", name: { kind: "Name", value: "timestamp" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "actor" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "type" } },
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "preview" } },
                { kind: "Field", name: { kind: "Name", value: "imageCount" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionPromptIndexQuery, SessionPromptIndexQueryVariables>;
export const ChannelsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Channels" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "memberOnly" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channels" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "memberOnly" },
                value: { kind: "Variable", name: { kind: "Name", value: "memberOnly" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "type" } },
                { kind: "Field", name: { kind: "Name", value: "visibility" } },
                { kind: "Field", name: { kind: "Name", value: "position" } },
                { kind: "Field", name: { kind: "Name", value: "groupId" } },
                { kind: "Field", name: { kind: "Name", value: "baseBranch" } },
                { kind: "Field", name: { kind: "Name", value: "setupScript" } },
                { kind: "Field", name: { kind: "Name", value: "runScripts" } },
                { kind: "Field", name: { kind: "Name", value: "viewerIsMember" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChannelsQuery, ChannelsQueryVariables>;
export const ChannelGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "ChannelGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "channelGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "position" } },
                { kind: "Field", name: { kind: "Name", value: "isCollapsed" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChannelGroupsQuery, ChannelGroupsQueryVariables>;
export const ReposDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Repos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReposQuery, ReposQueryVariables>;
export const ChatsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "Chats" },
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "chats" },
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "type" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "members" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "user" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "joinedAt" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ChatsQuery, ChatsQueryVariables>;
export const InboxItemsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "InboxItems" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "inboxItems" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "itemType" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "title" } },
                { kind: "Field", name: { kind: "Name", value: "summary" } },
                { kind: "Field", name: { kind: "Name", value: "payload" } },
                { kind: "Field", name: { kind: "Name", value: "userId" } },
                { kind: "Field", name: { kind: "Name", value: "sourceType" } },
                { kind: "Field", name: { kind: "Name", value: "sourceId" } },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "resolvedAt" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<InboxItemsQuery, InboxItemsQueryVariables>;
export const SidebarSessionGroupsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "SidebarSessionGroups" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "archived" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "includeActiveMerged" } },
          type: { kind: "NamedType", name: { kind: "Name", value: "Boolean" } },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessionGroups" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "channelId" },
                value: { kind: "Variable", name: { kind: "Name", value: "channelId" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "archived" },
                value: { kind: "Variable", name: { kind: "Name", value: "archived" } },
              },
              {
                kind: "Argument",
                name: { kind: "Name", value: "includeActiveMerged" },
                value: { kind: "Variable", name: { kind: "Name", value: "includeActiveMerged" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "slug" } },
                { kind: "Field", name: { kind: "Name", value: "status" } },
                { kind: "Field", name: { kind: "Name", value: "visibility" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "owner" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                { kind: "Field", name: { kind: "Name", value: "archivedAt" } },
                { kind: "Field", name: { kind: "Name", value: "setupStatus" } },
                { kind: "Field", name: { kind: "Name", value: "setupError" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "channel" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                  },
                },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "repo" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "branch" } },
                { kind: "Field", name: { kind: "Name", value: "workdir" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "connection" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "state" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                      { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                      { kind: "Field", name: { kind: "Name", value: "lastError" } },
                      { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                      { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                      { kind: "Field", name: { kind: "Name", value: "canMove" } },
                      { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                    ],
                  },
                },
                { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                {
                  kind: "Field",
                  name: { kind: "Name", value: "sessions" },
                  selectionSet: {
                    kind: "SelectionSet",
                    selections: [
                      { kind: "Field", name: { kind: "Name", value: "id" } },
                      { kind: "Field", name: { kind: "Name", value: "name" } },
                      { kind: "Field", name: { kind: "Name", value: "agentStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionStatus" } },
                      { kind: "Field", name: { kind: "Name", value: "tool" } },
                      { kind: "Field", name: { kind: "Name", value: "model" } },
                      { kind: "Field", name: { kind: "Name", value: "reasoningEffort" } },
                      { kind: "Field", name: { kind: "Name", value: "hosting" } },
                      { kind: "Field", name: { kind: "Name", value: "branch" } },
                      { kind: "Field", name: { kind: "Name", value: "workdir" } },
                      { kind: "Field", name: { kind: "Name", value: "prUrl" } },
                      { kind: "Field", name: { kind: "Name", value: "worktreeDeleted" } },
                      { kind: "Field", name: { kind: "Name", value: "sessionGroupId" } },
                      { kind: "Field", name: { kind: "Name", value: "lastUserMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "lastMessageAt" } },
                      { kind: "Field", name: { kind: "Name", value: "inputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "outputTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheReadTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "cacheCreationTokens" } },
                      { kind: "Field", name: { kind: "Name", value: "costUsd" } },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "connection" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "state" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeInstanceId" } },
                            { kind: "Field", name: { kind: "Name", value: "runtimeLabel" } },
                            { kind: "Field", name: { kind: "Name", value: "lastError" } },
                            { kind: "Field", name: { kind: "Name", value: "retryCount" } },
                            { kind: "Field", name: { kind: "Name", value: "canRetry" } },
                            { kind: "Field", name: { kind: "Name", value: "canMove" } },
                            { kind: "Field", name: { kind: "Name", value: "autoRetryable" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "createdBy" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                            { kind: "Field", name: { kind: "Name", value: "avatarUrl" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "repo" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [
                            { kind: "Field", name: { kind: "Name", value: "id" } },
                            { kind: "Field", name: { kind: "Name", value: "name" } },
                          ],
                        },
                      },
                      {
                        kind: "Field",
                        name: { kind: "Name", value: "channel" },
                        selectionSet: {
                          kind: "SelectionSet",
                          selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
                        },
                      },
                      { kind: "Field", name: { kind: "Name", value: "createdAt" } },
                      { kind: "Field", name: { kind: "Name", value: "updatedAt" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SidebarSessionGroupsQuery, SidebarSessionGroupsQueryVariables>;
export const OnboardingReposDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "OnboardingRepos" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "repos" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [
                { kind: "Field", name: { kind: "Name", value: "id" } },
                { kind: "Field", name: { kind: "Name", value: "name" } },
                { kind: "Field", name: { kind: "Name", value: "provider" } },
                { kind: "Field", name: { kind: "Name", value: "remoteUrl" } },
                { kind: "Field", name: { kind: "Name", value: "defaultBranch" } },
                { kind: "Field", name: { kind: "Name", value: "webhookActive" } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OnboardingReposQuery, OnboardingReposQueryVariables>;
export const OnboardingSessionsDocument = {
  kind: "Document",
  definitions: [
    {
      kind: "OperationDefinition",
      operation: "query",
      name: { kind: "Name", value: "OnboardingSessions" },
      variableDefinitions: [
        {
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
      ],
      selectionSet: {
        kind: "SelectionSet",
        selections: [
          {
            kind: "Field",
            name: { kind: "Name", value: "sessions" },
            arguments: [
              {
                kind: "Argument",
                name: { kind: "Name", value: "organizationId" },
                value: { kind: "Variable", name: { kind: "Name", value: "organizationId" } },
              },
            ],
            selectionSet: {
              kind: "SelectionSet",
              selections: [{ kind: "Field", name: { kind: "Name", value: "id" } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OnboardingSessionsQuery, OnboardingSessionsQueryVariables>;
