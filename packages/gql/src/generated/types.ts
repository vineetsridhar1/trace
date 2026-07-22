import { JsonValue } from "../json";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
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

export type ApiTokenProvider = "anthropic" | "github" | "openai" | "ssh_key";

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

export type CodexAuthMethod = "access_token" | "api_key" | "chatgpt_session";

export type CodexCredentialStatus = {
  __typename?: "CodexCredentialStatus";
  method: CodexAuthMethod;
  updatedAt: Scalars["DateTime"]["output"];
};

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

export type CreateOrganizationInput = {
  name: Scalars["String"]["input"];
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

export type DesignElementStyleEditResult = {
  __typename?: "DesignElementStyleEditResult";
  elementId: Scalars["String"]["output"];
  sessionGroupId: Scalars["ID"]["output"];
  sourceHash: Scalars["String"]["output"];
  styles: DesignElementStyles;
};

export type DesignElementStyleSource = {
  __typename?: "DesignElementStyleSource";
  elementId: Scalars["String"]["output"];
  sessionGroupId: Scalars["ID"]["output"];
  sourceHash: Scalars["String"]["output"];
  styles: DesignElementStyles;
};

export type DesignElementStyles = {
  __typename?: "DesignElementStyles";
  alignItems?: Maybe<Scalars["String"]["output"]>;
  alignSelf?: Maybe<Scalars["String"]["output"]>;
  aspectRatio?: Maybe<Scalars["String"]["output"]>;
  backgroundColor?: Maybe<Scalars["String"]["output"]>;
  borderColor?: Maybe<Scalars["String"]["output"]>;
  borderRadius?: Maybe<Scalars["Int"]["output"]>;
  borderStyle?: Maybe<Scalars["String"]["output"]>;
  borderWidth?: Maybe<Scalars["Int"]["output"]>;
  bottom?: Maybe<Scalars["String"]["output"]>;
  boxShadow?: Maybe<Scalars["String"]["output"]>;
  boxSizing?: Maybe<Scalars["String"]["output"]>;
  color?: Maybe<Scalars["String"]["output"]>;
  cursor?: Maybe<Scalars["String"]["output"]>;
  display?: Maybe<Scalars["String"]["output"]>;
  filter?: Maybe<Scalars["String"]["output"]>;
  flexDirection?: Maybe<Scalars["String"]["output"]>;
  flexGrow?: Maybe<Scalars["Float"]["output"]>;
  fontFamily?: Maybe<Scalars["String"]["output"]>;
  fontSize?: Maybe<Scalars["Int"]["output"]>;
  fontStyle?: Maybe<Scalars["String"]["output"]>;
  fontWeight?: Maybe<Scalars["Int"]["output"]>;
  gap?: Maybe<Scalars["Int"]["output"]>;
  height?: Maybe<Scalars["String"]["output"]>;
  justifyContent?: Maybe<Scalars["String"]["output"]>;
  left?: Maybe<Scalars["String"]["output"]>;
  letterSpacing?: Maybe<Scalars["Int"]["output"]>;
  lineHeight?: Maybe<Scalars["Int"]["output"]>;
  marginBottom?: Maybe<Scalars["Int"]["output"]>;
  marginLeft?: Maybe<Scalars["Int"]["output"]>;
  marginRight?: Maybe<Scalars["Int"]["output"]>;
  marginTop?: Maybe<Scalars["Int"]["output"]>;
  maxHeight?: Maybe<Scalars["String"]["output"]>;
  maxWidth?: Maybe<Scalars["String"]["output"]>;
  minHeight?: Maybe<Scalars["String"]["output"]>;
  minWidth?: Maybe<Scalars["String"]["output"]>;
  objectFit?: Maybe<Scalars["String"]["output"]>;
  opacity?: Maybe<Scalars["Float"]["output"]>;
  overflow?: Maybe<Scalars["String"]["output"]>;
  paddingBottom?: Maybe<Scalars["Int"]["output"]>;
  paddingLeft?: Maybe<Scalars["Int"]["output"]>;
  paddingRight?: Maybe<Scalars["Int"]["output"]>;
  paddingTop?: Maybe<Scalars["Int"]["output"]>;
  paddingX?: Maybe<Scalars["Int"]["output"]>;
  paddingY?: Maybe<Scalars["Int"]["output"]>;
  pointerEvents?: Maybe<Scalars["String"]["output"]>;
  position?: Maybe<Scalars["String"]["output"]>;
  right?: Maybe<Scalars["String"]["output"]>;
  textAlign?: Maybe<Scalars["String"]["output"]>;
  textDecoration?: Maybe<Scalars["String"]["output"]>;
  textOverflow?: Maybe<Scalars["String"]["output"]>;
  textShadow?: Maybe<Scalars["String"]["output"]>;
  textTransform?: Maybe<Scalars["String"]["output"]>;
  top?: Maybe<Scalars["String"]["output"]>;
  transform?: Maybe<Scalars["String"]["output"]>;
  whiteSpace?: Maybe<Scalars["String"]["output"]>;
  width?: Maybe<Scalars["String"]["output"]>;
  zIndex?: Maybe<Scalars["String"]["output"]>;
};

export type DesignElementStylesInput = {
  alignItems?: InputMaybe<Scalars["String"]["input"]>;
  alignSelf?: InputMaybe<Scalars["String"]["input"]>;
  aspectRatio?: InputMaybe<Scalars["String"]["input"]>;
  backgroundColor?: InputMaybe<Scalars["String"]["input"]>;
  borderColor?: InputMaybe<Scalars["String"]["input"]>;
  borderRadius?: InputMaybe<Scalars["Int"]["input"]>;
  borderStyle?: InputMaybe<Scalars["String"]["input"]>;
  borderWidth?: InputMaybe<Scalars["Int"]["input"]>;
  bottom?: InputMaybe<Scalars["String"]["input"]>;
  boxShadow?: InputMaybe<Scalars["String"]["input"]>;
  boxSizing?: InputMaybe<Scalars["String"]["input"]>;
  color?: InputMaybe<Scalars["String"]["input"]>;
  cursor?: InputMaybe<Scalars["String"]["input"]>;
  display?: InputMaybe<Scalars["String"]["input"]>;
  filter?: InputMaybe<Scalars["String"]["input"]>;
  flexDirection?: InputMaybe<Scalars["String"]["input"]>;
  flexGrow?: InputMaybe<Scalars["Float"]["input"]>;
  fontFamily?: InputMaybe<Scalars["String"]["input"]>;
  fontSize?: InputMaybe<Scalars["Int"]["input"]>;
  fontStyle?: InputMaybe<Scalars["String"]["input"]>;
  fontWeight?: InputMaybe<Scalars["Int"]["input"]>;
  gap?: InputMaybe<Scalars["Int"]["input"]>;
  height?: InputMaybe<Scalars["String"]["input"]>;
  justifyContent?: InputMaybe<Scalars["String"]["input"]>;
  left?: InputMaybe<Scalars["String"]["input"]>;
  letterSpacing?: InputMaybe<Scalars["Int"]["input"]>;
  lineHeight?: InputMaybe<Scalars["Int"]["input"]>;
  marginBottom?: InputMaybe<Scalars["Int"]["input"]>;
  marginLeft?: InputMaybe<Scalars["Int"]["input"]>;
  marginRight?: InputMaybe<Scalars["Int"]["input"]>;
  marginTop?: InputMaybe<Scalars["Int"]["input"]>;
  maxHeight?: InputMaybe<Scalars["String"]["input"]>;
  maxWidth?: InputMaybe<Scalars["String"]["input"]>;
  minHeight?: InputMaybe<Scalars["String"]["input"]>;
  minWidth?: InputMaybe<Scalars["String"]["input"]>;
  objectFit?: InputMaybe<Scalars["String"]["input"]>;
  opacity?: InputMaybe<Scalars["Float"]["input"]>;
  overflow?: InputMaybe<Scalars["String"]["input"]>;
  paddingBottom?: InputMaybe<Scalars["Int"]["input"]>;
  paddingLeft?: InputMaybe<Scalars["Int"]["input"]>;
  paddingRight?: InputMaybe<Scalars["Int"]["input"]>;
  paddingTop?: InputMaybe<Scalars["Int"]["input"]>;
  paddingX?: InputMaybe<Scalars["Int"]["input"]>;
  paddingY?: InputMaybe<Scalars["Int"]["input"]>;
  pointerEvents?: InputMaybe<Scalars["String"]["input"]>;
  position?: InputMaybe<Scalars["String"]["input"]>;
  right?: InputMaybe<Scalars["String"]["input"]>;
  textAlign?: InputMaybe<Scalars["String"]["input"]>;
  textDecoration?: InputMaybe<Scalars["String"]["input"]>;
  textOverflow?: InputMaybe<Scalars["String"]["input"]>;
  textShadow?: InputMaybe<Scalars["String"]["input"]>;
  textTransform?: InputMaybe<Scalars["String"]["input"]>;
  top?: InputMaybe<Scalars["String"]["input"]>;
  transform?: InputMaybe<Scalars["String"]["input"]>;
  whiteSpace?: InputMaybe<Scalars["String"]["input"]>;
  width?: InputMaybe<Scalars["String"]["input"]>;
  zIndex?: InputMaybe<Scalars["String"]["input"]>;
};

export type DesignElementTextEditResult = {
  __typename?: "DesignElementTextEditResult";
  elementId: Scalars["String"]["output"];
  filePath: Scalars["String"]["output"];
  previousText: Scalars["String"]["output"];
  sessionGroupId: Scalars["ID"]["output"];
  sourceHash: Scalars["String"]["output"];
  text: Scalars["String"]["output"];
};

export type DesignElementTextSource = {
  __typename?: "DesignElementTextSource";
  elementId: Scalars["String"]["output"];
  filePath: Scalars["String"]["output"];
  sessionGroupId: Scalars["ID"]["output"];
  sourceHash: Scalars["String"]["output"];
  text: Scalars["String"]["output"];
};

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
  | "design_element_styles_updated"
  | "design_element_text_updated"
  | "design_preview_updated"
  | "entity_linked"
  | "inbox_item_created"
  | "inbox_item_resolved"
  | "managed_git_token_minted"
  | "manual_element_saved"
  | "member_joined"
  | "member_left"
  | "message_deleted"
  | "message_edited"
  | "message_sent"
  | "organization_created"
  | "pdf_export_updated"
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
  previewCapturedAt?: Maybe<Scalars["DateTime"]["output"]>;
  previewContentType?: Maybe<Scalars["String"]["output"]>;
  previewStatus?: Maybe<GitCheckpointCaptureStatus>;
  previewUrl?: Maybe<Scalars["String"]["output"]>;
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

export type ManualElementEditInput = {
  elementId: Scalars["String"]["input"];
  expectedStyleSourceHash?: InputMaybe<Scalars["String"]["input"]>;
  expectedTextSourceHash?: InputMaybe<Scalars["String"]["input"]>;
  filePath: Scalars["String"]["input"];
  styles?: InputMaybe<DesignElementStylesInput>;
  text?: InputMaybe<Scalars["String"]["input"]>;
};

export type ManualElementEditResult = {
  __typename?: "ManualElementEditResult";
  commitSha: Scalars["String"]["output"];
  elementId: Scalars["String"]["output"];
  filePath: Scalars["String"]["output"];
  sessionGroupId: Scalars["ID"]["output"];
  styleSourceHash?: Maybe<Scalars["String"]["output"]>;
  styles?: Maybe<DesignElementStyles>;
  text?: Maybe<Scalars["String"]["output"]>;
  textSourceHash?: Maybe<Scalars["String"]["output"]>;
};

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
  createChannel: Channel;
  createChannelGroup: ChannelGroup;
  createChannelTerminal: Terminal;
  createChat: Chat;
  createOrganization: OrgMember;
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
  deleteCodexCredential: Scalars["Boolean"]["output"];
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
  requestPdfSessionExport: Scalars["Boolean"]["output"];
  restartSessionProcess: SessionApplicationProcess;
  restoreLinkedCheckout: LinkedCheckoutActionResult;
  retrySessionConnection: Session;
  retrySessionGroupSetup: SessionGroup;
  revertSessionGroupFileChange: Scalars["Boolean"]["output"];
  revokeBridgeAccessGrant: BridgeAccessGrant;
  rotateSessionEndpoint: SessionEndpoint;
  runSession: Session;
  runSessionGroupSetupScript: Scalars["Boolean"]["output"];
  saveManualElementEdit: ManualElementEditResult;
  saveManualElementEdits: Array<ManualElementEditResult>;
  saveSessionGroupFile: Scalars["Boolean"]["output"];
  sendChannelMessage: Message;
  sendChatMessage: Message;
  sendMessage: Event;
  sendSessionMessage: Event;
  setApiToken: ApiTokenStatus;
  setCodexCredential: CodexCredentialStatus;
  setLinkedCheckoutAutoSync: LinkedCheckoutActionResult;
  setOrgSecret: OrgSecret;
  startSession: Session;
  startSessionApplication: Array<SessionApplicationProcess>;
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
  updateBridgeAccessGrant: BridgeAccessGrant;
  updateChannel: Channel;
  updateChannelGroup: ChannelGroup;
  updateDesignElementStyles: DesignElementStyleEditResult;
  updateDesignElementText: DesignElementTextEditResult;
  updateOrgMemberRole: OrgMember;
  updatePdfSessionFormat: Scalars["Boolean"]["output"];
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

export type MutationCreateOrganizationArgs = {
  input: CreateOrganizationInput;
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

export type MutationRequestPdfSessionExportArgs = {
  sessionGroupId: Scalars["ID"]["input"];
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

export type MutationSaveManualElementEditArgs = {
  input: ManualElementEditInput;
  sessionGroupId: Scalars["ID"]["input"];
};

export type MutationSaveManualElementEditsArgs = {
  inputs: Array<ManualElementEditInput>;
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

export type MutationSetApiTokenArgs = {
  input: SetApiTokenInput;
};

export type MutationSetCodexCredentialArgs = {
  input: SetCodexCredentialInput;
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

export type MutationUpdateDesignElementStylesArgs = {
  elementId: Scalars["String"]["input"];
  expectedSourceHash: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
  styles: DesignElementStylesInput;
};

export type MutationUpdateDesignElementTextArgs = {
  elementId: Scalars["String"]["input"];
  expectedSourceHash: Scalars["String"]["input"];
  filePath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
  text: Scalars["String"]["input"];
};

export type MutationUpdateOrgMemberRoleArgs = {
  organizationId: Scalars["ID"]["input"];
  role: UserRole;
  userId: Scalars["ID"]["input"];
};

export type MutationUpdatePdfSessionFormatArgs = {
  height: Scalars["Float"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
  unit: Scalars["String"]["input"];
  width: Scalars["Float"]["input"];
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
  /**
   * App-kind session groups for the org. Apps have no channel, so this is their
   * listing surface (the sidebar Apps section).
   */
  appSessionGroups: Array<SessionGroup>;
  availableRuntimes: Array<SessionRuntimeInstance>;
  availableSessionRuntimes: Array<SessionRuntimeInstance>;
  bridgeRuntimeAccess: BridgeRuntimeAccess;
  channel?: Maybe<Channel>;
  channelGroups: Array<ChannelGroup>;
  channelMessages: Array<Message>;
  channelTerminals: Array<Terminal>;
  channels: Array<Channel>;
  chat?: Maybe<Chat>;
  chatMessages: Array<Message>;
  chats: Array<Chat>;
  designElementStyleSource: DesignElementStyleSource;
  designElementTextSource: DesignElementTextSource;
  /** Design-kind session groups for the org (the sidebar Designs section). */
  designSessionGroups: Array<SessionGroup>;
  endpointTraffic: Array<EndpointTrafficEntry>;
  events: Array<Event>;
  inboxItems: Array<InboxItem>;
  linkedCheckoutChangedFile: LinkedCheckoutChangedFile;
  linkedCheckoutStatus: LinkedCheckoutStatus;
  myApiTokens: Array<ApiTokenStatus>;
  myBridgeRuntimes: Array<BridgeRuntime>;
  myCodexCredential?: Maybe<CodexCredentialStatus>;
  myConnections: Array<ConnectionsBridge>;
  myOrganizations: Array<OrgMember>;
  mySessions: Array<Session>;
  orgSecrets: Array<OrgSecret>;
  organization?: Maybe<Organization>;
  participants: Array<Participant>;
  pdfSessionDownloadUrl?: Maybe<Scalars["String"]["output"]>;
  /** PDF-kind session groups for the org (the sidebar PDFs section). */
  pdfSessionGroups: Array<SessionGroup>;
  pdfSessionPreviewUrl?: Maybe<Scalars["String"]["output"]>;
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

export type QueryDesignElementStyleSourceArgs = {
  elementId: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QueryDesignElementTextSourceArgs = {
  elementId: Scalars["String"]["input"];
  filePath: Scalars["String"]["input"];
  sessionGroupId: Scalars["ID"]["input"];
};

export type QueryDesignSessionGroupsArgs = {
  organizationId: Scalars["ID"]["input"];
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

export type QueryPdfSessionDownloadUrlArgs = {
  sessionGroupId: Scalars["ID"]["input"];
};

export type QueryPdfSessionGroupsArgs = {
  organizationId: Scalars["ID"]["input"];
};

export type QueryPdfSessionPreviewUrlArgs = {
  sessionGroupId: Scalars["ID"]["input"];
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
  env: Array<RepoEnvVar>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  ports: Array<RepoPortDefinition>;
  required: Scalars["Boolean"]["output"];
  workingDirectory?: Maybe<Scalars["String"]["output"]>;
};

export type RepoProcessDefinitionInput = {
  command: Scalars["String"]["input"];
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
  env: Array<RepoEnvVar>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  workingDirectory?: Maybe<Scalars["String"]["output"]>;
};

export type RepoSetupScriptInput = {
  command: Scalars["String"]["input"];
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
  designPreviewCapturedAt?: Maybe<Scalars["DateTime"]["output"]>;
  designPreviewCommitSha?: Maybe<Scalars["String"]["output"]>;
  designPreviewStatus?: Maybe<GitCheckpointCaptureStatus>;
  designPreviewUrl?: Maybe<Scalars["String"]["output"]>;
  forkedFromSessionGroup?: Maybe<SessionGroup>;
  forkedFromSessionGroupId?: Maybe<Scalars["ID"]["output"]>;
  gitCheckpoints: Array<GitCheckpoint>;
  id: Scalars["ID"]["output"];
  kind: SessionGroupKind;
  name: Scalars["String"]["output"];
  owner: User;
  pdfExportCapturedAt?: Maybe<Scalars["DateTime"]["output"]>;
  pdfExportCommitSha?: Maybe<Scalars["String"]["output"]>;
  pdfExportError?: Maybe<Scalars["String"]["output"]>;
  pdfExportStatus?: Maybe<Scalars["String"]["output"]>;
  pdfFormatVersion: Scalars["Int"]["output"];
  pdfPageHeight: Scalars["Float"]["output"];
  pdfPageUnit: Scalars["String"]["output"];
  pdfPageWidth: Scalars["Float"]["output"];
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

export type SessionGroupKind = "app" | "coding" | "design" | "pdf";

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

export type SetCodexCredentialInput = {
  credential: Scalars["String"]["input"];
  method: CodexAuthMethod;
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
  channelEvents: Event;
  chatEvents: Event;
  orgEvents: Event;
  sessionEvents: Event;
  sessionPortsChanged: SessionEndpoints;
  sessionStatusChanged: Session;
  ticketEvents: Event;
  userNotifications: Notification;
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

export type WorktreeChangesResult = {
  __typename?: "WorktreeChangesResult";
  files: Array<LinkedCheckoutChangedFile>;
  totalCount: Scalars["Int"]["output"];
  truncated: Scalars["Boolean"]["output"];
};
