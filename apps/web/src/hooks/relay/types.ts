// ─── Config types (mirror desktop apps/desktop/src/types.ts) ────────

export interface LocalChannelConfig {
  localRepoPath: string;
  setupScript?: string;
  runScript?: string;
  teardownScript?: string;
  systemInstructions?: string;
}

export interface GlobalAppConfig {
  terminalFontFamily?: string;
}

// ─── Agent types ────────────────────────────────────────────────────

export type AgentType = "claude" | "codex";

export interface AgentCapabilities {
  displayName: string;
  supportsResume: boolean;
  supportsPlanMode: boolean;
  models: { value: string; label: string; effortOptions?: { value: string; label: string }[] }[];
  defaultModel: string;
  effortLabel?: string;
}

export interface AgentDetectResult {
  available: boolean;
  version?: string;
  error?: string;
  authStatus?: "ok" | "missing";
  authHint?: string;
  installHint?: string;
}

export interface DetectedAgent {
  type: AgentType;
  capabilities: AgentCapabilities;
  detectResult: AgentDetectResult;
}

// ─── Worktree relay ─────────────────────────────────────────────────

export interface DeleteWorktreeParams {
  workspaceId: string;
  repoPath: string;
  teardownCommands?: string[];
}
export interface DeleteWorktreeResult {
  removed?: boolean;
  worktreePath?: string;
}

export interface CheckWorktreeExistsParams {
  workspaceId: string;
  repoPath: string;
}
export interface CheckWorktreeExistsResult {
  exists?: boolean;
  worktreePath?: string;
}

export interface MergeWorktreeParams {
  workspaceId: string;
  repoPath: string;
  baseBranch: string;
}
export interface MergeWorktreeResult {
  branch?: string;
}

export interface CommitWorktreeChangesParams {
  workspaceId: string;
}
export interface CommitWorktreeChangesResult {
  committed?: boolean;
}

export interface GetWorktreeDiffParams {
  workspaceId: string;
  baseBranch: string;
}
export interface GetWorktreeDiffResult {
  branchDiff?: string;
  uncommittedDiff?: string;
  stagedDiff?: string;
  status?: string;
}

export interface GetWorktreeBranchParams {
  workspaceId: string;
}
export interface GetWorktreeBranchResult {
  branch?: string;
}

// ─── Git relay ──────────────────────────────────────────────────────

export interface ListRepoBranchesParams {
  repoPath: string;
}
export interface ListRepoBranchesResult {
  branches: string[];
}

export interface CheckBranchesMergedParams {
  repoPath: string;
  targets: Array<{ workspaceId: string; branch: string }>;
  baseBranch: string;
}
export interface CheckBranchesMergedResult {
  merged: Record<string, boolean>;
}

export interface CheckMainStatusParams {
  repoPath: string;
  baseBranch: string;
}
export interface CheckMainStatusResult {
  isUpToDate?: boolean;
  commitsBehind?: number;
  commits?: { hash: string; author: string; message: string; date: string }[];
  localSha?: string;
  remoteSha?: string;
}

export interface PullMainParams {
  repoPath: string;
  baseBranch: string;
}

export interface CreateGitBranchParams {
  repoPath: string;
  branchName: string;
  baseBranch: string;
  scopingDocsPath?: string;
  sourceBranch?: string;
}

// ─── GitHub relay ───────────────────────────────────────────────────

export interface CheckGhAuthResult {
  available: boolean;
}

export interface PushWorktreeBranchParams {
  workspaceId: string;
  repoPath: string;
}

export interface EnsureWorktreeFromRemoteParams {
  workspaceId: string;
  repoPath: string;
  branchName: string;
}
export interface EnsureWorktreeFromRemoteResult {
  worktreePath?: string;
}

export interface CheckPRStatusesLocalParams {
  repoPath: string;
  branches: string[];
}
export interface PRStatus {
  branch: string;
  state: "open" | "closed" | "merged" | "none";
  prUrl: string | null;
}
export interface CheckPRStatusesLocalResult {
  statuses?: PRStatus[];
}

export interface CheckPRCILocalParams {
  repoPath: string;
  branches: string[];
}
export interface PRCIStatus {
  branch: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
}
export interface CheckPRCILocalResult {
  statuses?: PRCIStatus[];
}

export interface ListPullRequestsParams {
  repoPath: string;
}
export interface PullRequest {
  number: number;
  title: string;
  headRefName: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  url: string;
  labels: Array<{ name: string; color: string }>;
}
export interface ListPullRequestsResult {
  pullRequests?: PullRequest[];
}

export interface CheckoutPullRequestParams {
  repoPath: string;
  branchName: string;
  workspaceId: string;
  setupCommands?: string[];
}
export interface CheckoutPullRequestResult {
  worktreePath?: string;
}

export interface DetectInstalledAppsResult {
  apps: Array<{ id: string; label: string }>;
}

export interface OpenInAppParams {
  appId: string;
  targetPath: string;
}

// ─── Repo relay ─────────────────────────────────────────────────────

export interface ListRepoFilesParams {
  repoPath: string;
}
export interface ListRepoFilesResult {
  files: string[];
}

export interface SuggestScriptsParams {
  repoPath: string;
}
export interface SuggestScriptsResult {
  setupScript?: string;
  runScript?: string;
  reasoning?: string;
}

export interface ValidateRepoParams {
  repoPath: string;
}
export interface ValidateRepoResult {
  valid: boolean;
  originUrl?: string;
}

export interface SlashCommandDef {
  name: string;
  description: string;
  source: "global" | "project";
}

export interface ListSlashCommandsParams {
  repoPath: string;
}
export interface ListSlashCommandsResult {
  commands: SlashCommandDef[];
}

export interface ReadProductDocFileParams {
  filePath: string;
}
export interface ReadProductDocFileResult {
  content: string;
}

export interface WriteProductDocFileParams {
  filePath: string;
  content: string;
}

// ─── Misc relay ─────────────────────────────────────────────────────

export interface GetLocalConfigParams {
  channelId: string;
}
export interface GetLocalConfigResult {
  config: LocalChannelConfig | null;
}

export interface SetLocalConfigParams {
  channelId: string;
  data: LocalChannelConfig;
}

export interface GetAllLocalConfigsResult {
  configs: Record<string, LocalChannelConfig>;
}

export interface DeleteLocalConfigParams {
  channelId: string;
}

export interface GetGlobalConfigResult {
  config: GlobalAppConfig;
}

export interface SetGlobalConfigParams {
  data: GlobalAppConfig;
}

export interface AllocatePortsParams {
  workspaceId: string;
  count: number;
}
export interface AllocatePortsResult {
  ports?: number[];
}

export interface ReleasePortsParams {
  workspaceId: string;
}

export interface CheckRunningProcessesParams {
  workspaceIds: string[];
}
export interface CheckRunningProcessesResult {
  running: string[];
}

// ─── Agent relay (extends useAgentRelay) ────────────────────────────

export interface SpawnAgentParams {
  workspaceId: string;
  prompt: string;
  channelId: string;
  model?: string;
  effort?: string;
  planMode?: boolean;
  isOrchestrator?: boolean;
}

export interface DetectAgentsResult {
  agents: DetectedAgent[];
}

export interface ReportAgentActivityParams {
  workspaceId: string;
  eventType: string;
}
