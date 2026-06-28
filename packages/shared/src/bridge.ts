/**
 * Bridge protocol types — shared between desktop BridgeClient and container ContainerBridge.
 * Defines the wire protocol between bridge clients and the server's /bridge WebSocket.
 */

import type { GitCheckpointBridgePayload, GitCheckpointContext } from "./git-checkpoint.js";

// --- Server → Bridge commands ---

export interface BridgeRunCommand {
  type: "run";
  sessionId: string;
  prompt?: string;
  cwd?: string;
  tool?: string;
  model?: string;
  reasoningEffort?: string;
  enableClaudeInChrome?: boolean;
  interactionMode?: string;
  toolSessionId?: string;
  checkpointContext?: GitCheckpointContext | null;
  imageUrls?: string[];
}

export interface BridgeSendCommand {
  type: "send";
  sessionId: string;
  prompt: string;
  cwd?: string;
  tool?: string;
  model?: string;
  reasoningEffort?: string;
  enableClaudeInChrome?: boolean;
  interactionMode?: string;
  toolSessionId?: string;
  checkpointContext?: GitCheckpointContext | null;
  imageUrls?: string[];
}

export interface BridgePrepareCommand {
  type: "prepare";
  sessionId: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  /** Pre-assigned animal slug for the worktree. If absent, the bridge generates one. */
  slug?: string;
  repoId: string;
  repoName: string;
  repoRemoteUrl: string | null;
  defaultBranch: string;
  branch?: string;
  preserveBranchName?: boolean;
  checkpointSha?: string;
  readOnly?: boolean;
}

export interface BridgeUpgradeWorkspaceCommand {
  type: "upgrade_workspace";
  sessionId: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  /** Pre-assigned animal slug for the worktree. If absent, the bridge generates one. */
  slug?: string;
  repoId: string;
  repoName: string;
  repoRemoteUrl: string | null;
  defaultBranch: string;
  branch?: string;
  preserveBranchName?: boolean;
}

export interface BridgeTerminateCommand {
  type: "terminate";
  sessionId: string;
}

export interface BridgePauseCommand {
  type: "pause";
  sessionId: string;
}

export interface BridgeResumeCommand {
  type: "resume";
  sessionId: string;
}

export interface BridgeDeleteCommand {
  type: "delete";
  sessionId: string;
  workdir?: string;
  repoId?: string;
}

export interface BridgeListBranchesCommand {
  type: "list_branches";
  requestId: string;
  repoId: string;
}

export interface BridgeListWorkspaceSlugsCommand {
  type: "list_workspace_slugs";
  requestId: string;
  repoId: string;
}

export interface BridgeListFilesCommand {
  type: "list_files";
  requestId: string;
  sessionId: string;
  /** Fallback workdir from DB, used when bridge has no entry in sessionWorkdirs */
  workdirHint?: string;
}

export interface BridgeReadFileCommand {
  type: "read_file";
  requestId: string;
  sessionId: string;
  relativePath: string;
  /** Fallback workdir from DB, used when bridge has no entry in sessionWorkdirs */
  workdirHint?: string;
}

export interface BridgeWriteFileCommand {
  type: "write_file";
  requestId: string;
  sessionId: string;
  relativePath: string;
  content: string;
  /** Fallback workdir from DB, used when bridge has no entry in sessionWorkdirs */
  workdirHint?: string;
}

export interface BridgeCommitFileChangesCommand {
  type: "commit_file_changes";
  requestId: string;
  sessionId: string;
  message?: string | null;
  /** Fallback workdir from DB, used when bridge has no entry in sessionWorkdirs */
  workdirHint?: string;
}

export interface BridgeWorktreeChangesCommand {
  type: "worktree_changes";
  requestId: string;
  sessionId: string;
  workdirHint?: string;
}

export interface BridgeRevertWorktreeFileCommand {
  type: "revert_worktree_file";
  requestId: string;
  sessionId: string;
  filePath: string;
  workdirHint?: string;
}

export interface BridgeBranchDiffCommand {
  type: "branch_diff";
  requestId: string;
  sessionId: string;
  baseBranch: string;
  /** Fallback workdir from DB, used when bridge has no entry in sessionWorkdirs */
  workdirHint?: string;
}

export interface BridgeFileAtRefCommand {
  type: "file_at_ref";
  requestId: string;
  sessionId: string;
  filePath: string;
  ref: string;
  /** Fallback workdir from DB, used when bridge has no entry in sessionWorkdirs */
  workdirHint?: string;
}

export interface BridgeListSkillsCommand {
  type: "list_skills";
  requestId: string;
  sessionId: string;
  workdirHint?: string;
  includeUserSkills?: boolean;
  includeProjectSkills?: boolean;
}

export interface BridgeLinkedCheckoutStatusCommand {
  type: "linked_checkout_status";
  requestId: string;
  repoId: string;
}

export interface BridgeLinkedCheckoutChangedFileCommand {
  type: "linked_checkout_changed_file";
  requestId: string;
  repoId: string;
  filePath: string;
}

export interface BridgeLinkLinkedCheckoutRepoCommand {
  type: "linked_checkout_link_repo";
  requestId: string;
  repoId: string;
  localPath: string;
}

export interface BridgeSyncLinkedCheckoutCommand {
  type: "linked_checkout_sync";
  requestId: string;
  repoId: string;
  sessionGroupId: string;
  branch: string;
  commitSha?: string | null;
  autoSyncEnabled?: boolean;
  refreshBeforeSync?: boolean;
  conflictStrategy?: "discard" | "commit" | "rebase" | "stash" | null;
  commitMessage?: string | null;
}

export interface BridgeCommitLinkedCheckoutCommand {
  type: "linked_checkout_commit";
  requestId: string;
  repoId: string;
  sessionGroupId: string;
  message?: string | null;
}

export interface BridgeRestoreLinkedCheckoutCommand {
  type: "linked_checkout_restore";
  requestId: string;
  repoId: string;
}

export interface BridgeSetLinkedCheckoutAutoSyncCommand {
  type: "linked_checkout_set_auto_sync";
  requestId: string;
  repoId: string;
  enabled: boolean;
}

export interface BridgeSessionGitSyncStatusCommand {
  type: "session_git_sync_status";
  requestId: string;
  sessionId: string;
  workdirHint?: string;
}

export interface BridgeSessionCurrentBranchCommand {
  type: "session_current_branch";
  requestId: string;
  sessionId: string;
  workdirHint?: string;
}

export interface BridgeTrackSessionCommand {
  type: "track_session";
  sessionId: string;
  workdir: string;
  readOnly?: boolean;
  sessionGroupId?: string | null;
}

// --- Terminal commands (Server → Bridge) ---

export interface BridgeTerminalCreateCommand {
  type: "terminal_create";
  terminalId: string;
  sessionId: string;
  ownerUserId: string;
  cols: number;
  rows: number;
  cwd: string;
}

export interface BridgeTerminalInputCommand {
  type: "terminal_input";
  terminalId: string;
  data: string;
}

export interface BridgeTerminalResizeCommand {
  type: "terminal_resize";
  terminalId: string;
  cols: number;
  rows: number;
}

export interface BridgeTerminalDestroyCommand {
  type: "terminal_destroy";
  terminalId: string;
}

export interface BridgeSetupScriptRunCommand {
  type: "setup_script_run";
  requestId: string;
  sessionGroupId: string;
  sessionId: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
}

export interface BridgeAppProcessStartCommand {
  type: "app_process_start";
  requestId: string;
  processInstanceId: string;
  sessionGroupId: string;
  sessionId: string;
  appConfigId: string;
  processConfigId: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  ports: Array<{ portConfigId: string; port: number; protocol: "http" }>;
}

export interface BridgeAppProcessStopCommand {
  type: "app_process_stop";
  requestId: string;
  processInstanceId: string;
}

export interface BridgeEndpointHttpRequestCommand {
  type: "endpoint_http_request";
  requestId: string;
  endpointId: string;
  processInstanceId?: string;
  port: number;
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  bodyBase64?: string;
}

export interface BridgeEndpointWebSocketOpenCommand {
  type: "endpoint_ws_open";
  requestId: string;
  endpointId: string;
  port: number;
  path: string;
  headers: Record<string, string | string[]>;
}

export interface BridgeEndpointWebSocketDataCommand {
  type: "endpoint_ws_data";
  requestId: string;
  dataBase64: string;
}

export interface BridgeEndpointWebSocketCloseCommand {
  type: "endpoint_ws_close";
  requestId: string;
  code?: number;
  reason?: string;
}

export type BridgeCommand =
  | BridgeRunCommand
  | BridgeSendCommand
  | BridgePrepareCommand
  | BridgeUpgradeWorkspaceCommand
  | BridgeTerminateCommand
  | BridgePauseCommand
  | BridgeResumeCommand
  | BridgeDeleteCommand
  | BridgeListBranchesCommand
  | BridgeListWorkspaceSlugsCommand
  | BridgeListFilesCommand
  | BridgeReadFileCommand
  | BridgeWriteFileCommand
  | BridgeCommitFileChangesCommand
  | BridgeWorktreeChangesCommand
  | BridgeRevertWorktreeFileCommand
  | BridgeBranchDiffCommand
  | BridgeFileAtRefCommand
  | BridgeListSkillsCommand
  | BridgeLinkedCheckoutStatusCommand
  | BridgeLinkedCheckoutChangedFileCommand
  | BridgeLinkLinkedCheckoutRepoCommand
  | BridgeSyncLinkedCheckoutCommand
  | BridgeCommitLinkedCheckoutCommand
  | BridgeRestoreLinkedCheckoutCommand
  | BridgeSetLinkedCheckoutAutoSyncCommand
  | BridgeSessionGitSyncStatusCommand
  | BridgeSessionCurrentBranchCommand
  | BridgeTrackSessionCommand
  | BridgeTerminalCreateCommand
  | BridgeTerminalInputCommand
  | BridgeTerminalResizeCommand
  | BridgeTerminalDestroyCommand
  | BridgeSetupScriptRunCommand
  | BridgeAppProcessStartCommand
  | BridgeAppProcessStopCommand
  | BridgeEndpointHttpRequestCommand
  | BridgeEndpointWebSocketOpenCommand
  | BridgeEndpointWebSocketDataCommand
  | BridgeEndpointWebSocketCloseCommand;

// --- Bridge → Server messages ---

export interface BridgeRuntimeHello {
  type: "runtime_hello";
  instanceId: string;
  label: string;
  hostingMode: "cloud" | "local";
  /** Required for provisioned cloud runtimes. */
  protocolVersion?: number;
  /** Required for provisioned cloud runtimes. */
  agentVersion?: string;
  supportedTools: string[];
  /** Repo IDs this bridge has locally registered (device bridges only). Empty for cloud. */
  registeredRepoIds: string[];
  /** Active terminal ptys still running on this bridge (reported on reconnect). */
  activeTerminals?: Array<{ terminalId: string; sessionId: string; ownerUserId: string }>;
}

export interface BridgeRuntimeHeartbeat {
  type: "runtime_heartbeat";
  instanceId: string;
  /** Sessions with an actively running coding-tool process on this bridge. */
  activeSessionIds?: string[];
}

export interface BridgeRegisterSession {
  type: "register_session";
  sessionId: string;
}

export interface BridgeSessionOutput {
  type: "session_output";
  sessionId: string;
  data: unknown;
}

export interface BridgeSessionComplete {
  type: "session_complete";
  sessionId: string;
}

export interface BridgeWorkspaceReady {
  type: "workspace_ready";
  sessionId: string;
  workdir: string;
  branch?: string;
  warning?: BridgeWorkspaceWarning;
  /** Animal slug used for this worktree (reported back so the server can store it). */
  slug?: string;
}

export interface BridgeWorkspaceWarning {
  type: "branch_missing_restored_from_base";
  branch: string;
  baseBranch: string;
  message: string;
}

export interface BridgeWorkspaceFailed {
  type: "workspace_failed";
  sessionId: string;
  error: string;
}

export interface BridgeToolSessionId {
  type: "tool_session_id";
  sessionId: string;
  toolSessionId: string;
}

export interface BridgeToolSessionMissing {
  type: "tool_session_missing";
  sessionId: string;
  toolSessionId: string;
  message?: string;
  interactionMode?: string;
  checkpointContext?: GitCheckpointContext | null;
  imageUrls?: string[];
}

export interface BridgeGitCheckpoint {
  type: "git_checkpoint";
  sessionId: string;
  checkpoint: GitCheckpointBridgePayload;
}

/** Sent when a device bridge links a new repo (e.g. via saveRepoPath). Updates server-side registeredRepoIds. */
export interface BridgeRepoLinked {
  type: "repo_linked";
  repoId: string;
}

export interface BridgeLinkedCheckoutStatus {
  repoId: string;
  repoPath: string | null;
  isAttached: boolean;
  attachedSessionGroupId: string | null;
  targetBranch: string | null;
  autoSyncEnabled: boolean;
  currentBranch: string | null;
  currentCommitSha: string | null;
  lastSyncedCommitSha: string | null;
  lastSyncError: string | null;
  restoreBranch: string | null;
  restoreCommitSha: string | null;
  hasUncommittedChanges: boolean;
  changedFiles: BridgeLinkedCheckoutChangedFile[];
  changedFilesTotalCount: number;
  changedFilesTruncated: boolean;
}

export interface BridgeLinkedCheckoutChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  diff: string;
  truncated: boolean;
  originalContent: string;
  modifiedContent: string;
  contentTruncated: boolean;
}

export type BridgeLinkedCheckoutChangedFilePreview = BridgeLinkedCheckoutChangedFile;

export interface BridgeWorktreeChangesPayload {
  files: BridgeLinkedCheckoutChangedFile[];
  totalCount: number;
  truncated: boolean;
}

export type BridgeLinkedCheckoutErrorCode = "DIRTY_ROOT_CHECKOUT";

export interface BridgeLinkedCheckoutActionResultPayload {
  ok: boolean;
  status: BridgeLinkedCheckoutStatus;
  error: string | null;
  errorCode?: BridgeLinkedCheckoutErrorCode | null;
}

export interface BridgeLinkedCheckoutStatusResult {
  type: "linked_checkout_status_result";
  requestId: string;
  status: BridgeLinkedCheckoutStatus;
}

export interface BridgeLinkedCheckoutChangedFileResult {
  type: "linked_checkout_changed_file_result";
  requestId: string;
  file?: BridgeLinkedCheckoutChangedFilePreview;
  error?: string;
}

export interface BridgeLinkedCheckoutActionResult {
  type: "linked_checkout_action_result";
  requestId: string;
  action: "link_repo" | "sync" | "commit" | "restore" | "set_auto_sync";
  result: BridgeLinkedCheckoutActionResultPayload;
}

export interface BridgeSessionGitSyncStatus {
  branch: string | null;
  headCommitSha: string | null;
  upstreamBranch: string | null;
  upstreamCommitSha: string | null;
  aheadCount: number;
  behindCount: number;
  remoteBranch: string | null;
  remoteCommitSha: string | null;
  remoteAheadCount: number;
  remoteBehindCount: number;
  hasUncommittedChanges: boolean;
}

export interface BridgeSessionGitSyncStatusResult {
  type: "session_git_sync_status_result";
  requestId: string;
  status?: BridgeSessionGitSyncStatus;
  error?: string;
}

export interface BridgeSessionCurrentBranchResult {
  type: "session_current_branch_result";
  requestId: string;
  branch?: string | null;
  error?: string;
}

export interface BridgePrObservation {
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  merged: boolean;
}

export interface BridgeSessionPrStatus {
  type: "session_pr_status";
  sessionId: string;
  branch: string | null;
  observedAt: string;
  pr: BridgePrObservation | null;
  error?: string;
}

export interface BridgeBranchesResult {
  type: "branches_result";
  requestId: string;
  branches: string[];
  error?: string;
}

export interface BridgeWorkspaceSlugsResult {
  type: "workspace_slugs_result";
  requestId: string;
  slugs: string[];
  error?: string;
}

export interface BridgeFilesResult {
  type: "files_result";
  requestId: string;
  files: string[];
  error?: string;
}

export interface BridgeFileContentResult {
  type: "file_content_result";
  requestId: string;
  content: string;
  error?: string;
}

export interface BridgeFileWriteResult {
  type: "file_write_result";
  requestId: string;
  error?: string;
}

export interface BridgeFileCommitResult {
  type: "file_commit_result";
  requestId: string;
  commitSha?: string;
  error?: string;
}

export interface BridgeWorktreeChangesResult {
  type: "worktree_changes_result";
  requestId: string;
  files: BridgeLinkedCheckoutChangedFile[];
  totalCount: number;
  truncated: boolean;
  error?: string;
}

export interface BridgeRevertWorktreeFileResult {
  type: "revert_worktree_file_result";
  requestId: string;
  error?: string;
}

export interface BridgeBranchDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface BridgeBranchDiffResult {
  type: "branch_diff_result";
  requestId: string;
  files: BridgeBranchDiffFile[];
  error?: string;
}

export interface BridgeFileAtRefResult {
  type: "file_at_ref_result";
  requestId: string;
  content: string;
  error?: string;
}

export interface BridgeSkillInfo {
  name: string;
  description: string;
  source: "user" | "project";
}

export interface BridgeSkillsResult {
  type: "skills_result";
  requestId: string;
  skills: BridgeSkillInfo[];
  error?: string;
}

// --- Terminal messages (Bridge → Server) ---

export interface BridgeTerminalReady {
  type: "terminal_ready";
  terminalId: string;
}

export interface BridgeTerminalOutput {
  type: "terminal_output";
  terminalId: string;
  data: string;
}

export interface BridgeTerminalExit {
  type: "terminal_exit";
  terminalId: string;
  exitCode: number;
}

export interface BridgeTerminalError {
  type: "terminal_error";
  terminalId: string;
  error: string;
}

export interface BridgeSetupScriptResult {
  type: "setup_script_result";
  requestId: string;
  exitCode: number;
  output?: string;
  error?: string;
}

export interface BridgeSetupScriptLog {
  type: "setup_script_log";
  requestId: string;
  stream: "stdout" | "stderr";
  data: string;
}

export interface BridgeAppProcessStarted {
  type: "app_process_started";
  requestId: string;
  processInstanceId: string;
  bridgeProcessId: string;
}

export interface BridgeAppProcessLog {
  type: "app_process_log";
  processInstanceId: string;
  stream: "stdout" | "stderr";
  data: string;
}

export interface BridgeAppProcessExited {
  type: "app_process_exited";
  processInstanceId: string;
  exitCode: number | null;
  signal?: string;
}

export interface BridgeAppProcessError {
  type: "app_process_error";
  requestId?: string;
  processInstanceId?: string;
  error: string;
}

export interface BridgeEndpointHttpResponse {
  type: "endpoint_http_response";
  requestId: string;
  status: number;
  headers: Record<string, string | string[]>;
  bodyBase64?: string;
}

export interface BridgeEndpointHttpError {
  type: "endpoint_http_error";
  requestId: string;
  error: string;
}

export interface BridgeEndpointWebSocketOpened {
  type: "endpoint_ws_opened";
  requestId: string;
}

export interface BridgeEndpointWebSocketData {
  type: "endpoint_ws_data";
  requestId: string;
  dataBase64: string;
}

export interface BridgeEndpointWebSocketClosed {
  type: "endpoint_ws_closed";
  requestId: string;
  code?: number;
  reason?: string;
}

export type BridgeMessage =
  | BridgeRuntimeHello
  | BridgeRuntimeHeartbeat
  | BridgeRegisterSession
  | BridgeSessionOutput
  | BridgeSessionComplete
  | BridgeWorkspaceReady
  | BridgeWorkspaceFailed
  | BridgeToolSessionId
  | BridgeToolSessionMissing
  | BridgeGitCheckpoint
  | BridgeRepoLinked
  | BridgeLinkedCheckoutStatusResult
  | BridgeLinkedCheckoutChangedFileResult
  | BridgeLinkedCheckoutActionResult
  | BridgeSessionGitSyncStatusResult
  | BridgeSessionCurrentBranchResult
  | BridgeSessionPrStatus
  | BridgeBranchesResult
  | BridgeWorkspaceSlugsResult
  | BridgeFilesResult
  | BridgeFileContentResult
  | BridgeFileWriteResult
  | BridgeFileCommitResult
  | BridgeWorktreeChangesResult
  | BridgeRevertWorktreeFileResult
  | BridgeBranchDiffResult
  | BridgeFileAtRefResult
  | BridgeSkillsResult
  | BridgeTerminalReady
  | BridgeTerminalOutput
  | BridgeTerminalExit
  | BridgeTerminalError
  | BridgeSetupScriptResult
  | BridgeSetupScriptLog
  | BridgeAppProcessStarted
  | BridgeAppProcessLog
  | BridgeAppProcessExited
  | BridgeAppProcessError
  | BridgeEndpointHttpResponse
  | BridgeEndpointHttpError
  | BridgeEndpointWebSocketOpened
  | BridgeEndpointWebSocketData
  | BridgeEndpointWebSocketClosed;

// --- Utilities ---

/** Parse `git branch -a --format=%(refname:short)` output into deduplicated branch names. */
export function parseBranchOutput(stdout: string): string[] {
  const branches = stdout
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.replace(/^origin\//, ""))
    .filter((b) => b !== "HEAD" && !b.includes(" -> "));
  return [...new Set(branches)];
}

/** Directories to skip when walking a filesystem tree. */
export const WALK_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  "__pycache__",
  ".venv",
  "vendor",
  ".cache",
  "coverage",
]);
export const MAX_FILE_VIEW_BYTES = 512 * 1024;
const MAX_WORKTREE_CHANGE_FILES = 200;
const MAX_WORKTREE_CHANGE_FIELD_BYTES = 64 * 1024;
const MAX_WORKTREE_CHANGES_PAYLOAD_BYTES = 512 * 1024;
const BINARY_DETECTION_SAMPLE_BYTES = 8 * 1024;

/**
 * Recursively walk a directory, returning relative file paths.
 * Requires Node `fs` and `path` — only usable in bridge/server contexts, not browser.
 */
export async function walkDir(
  root: string,
  dir: string,
  maxDepth: number,
  fsModule: {
    promises: {
      readdir: (
        p: string,
        opts: { withFileTypes: true },
      ) => Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>>;
    };
  },
  pathModule: { join: (...p: string[]) => string; relative: (from: string, to: string) => string },
): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const entries = await fsModule.promises.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    if (WALK_IGNORE.has(entry.name) || entry.name.startsWith(".DS_Store")) continue;
    const full = pathModule.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkDir(root, full, maxDepth - 1, fsModule, pathModule);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(pathModule.relative(root, full));
    }
  }
  return results;
}

// --- Shared bridge file operation handlers ---

/** Minimal fs/path interfaces needed by the shared file handlers (Node compatible). */
export interface BridgeFsLike {
  readFile: (path: string, cb: (err: NodeJS.ErrnoException | null, data: Buffer) => void) => void;
  promises: {
    readdir: (
      p: string,
      opts: { withFileTypes: true },
    ) => Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>>;
    realpath: (p: string) => Promise<string>;
    stat: (p: string) => Promise<{ size: number; isFile: () => boolean }>;
    writeFile: (p: string, data: string) => Promise<void>;
  };
}
export interface BridgePathLike {
  resolve: (...p: string[]) => string;
  join: (...p: string[]) => string;
  relative: (from: string, to: string) => string;
  sep: string;
}
/** Callback-based git ls-files runner, injected by bridges to avoid Node child_process type issues. */
export type GitLsFilesFn = (cwd: string, cb: (err: Error | null, files: string[]) => void) => void;

function isPathInsideRoot(root: string, target: string, pathModule: BridgePathLike): boolean {
  return target === root || target.startsWith(root + pathModule.sep);
}

function hasInvalidRelativePathSegments(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\")) {
    return true;
  }
  return relativePath.split("/").some((part) => part.length === 0 || part === "." || part === "..");
}

function isLikelyBinaryFile(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, BINARY_DETECTION_SAMPLE_BYTES);
  if (sample.includes(0)) return true;

  let suspiciousBytes = 0;
  for (const byte of sample) {
    const isAllowedControl = byte === 9 || byte === 10 || byte === 13;
    if (!isAllowedControl && (byte < 32 || byte === 127)) {
      suspiciousBytes += 1;
    }
  }
  return sample.length > 0 && suspiciousBytes / sample.length > 0.3;
}

/**
 * Handle a `list_files` bridge command. Shared between desktop and container bridges
 * to avoid code duplication.
 */
export function handleListFiles(
  cmd: BridgeListFilesCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  deps: { gitLsFiles: GitLsFilesFn; fs: BridgeFsLike; path: BridgePathLike },
): void {
  const { requestId, sessionId, workdirHint } = cmd;
  const workdir = sessionWorkdirs.get(sessionId) ?? workdirHint;
  if (!workdir) {
    send({
      type: "files_result",
      requestId,
      files: [],
      error: `No workdir known for session ${sessionId}`,
    });
    return;
  }
  deps.gitLsFiles(workdir, (err, files) => {
    if (err) {
      walkDir(workdir, workdir, 6, deps.fs, deps.path).then(
        (walked) => send({ type: "files_result", requestId, files: walked }),
        (walkErr) => send({ type: "files_result", requestId, files: [], error: walkErr.message }),
      );
      return;
    }
    send({ type: "files_result", requestId, files });
  });
}

/**
 * Handle a `read_file` bridge command. Shared between desktop and container bridges.
 * Includes defense-in-depth path traversal checks.
 */
export function handleReadFile(
  cmd: BridgeReadFileCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  deps: { fs: BridgeFsLike; path: BridgePathLike },
): void {
  const { requestId, sessionId, relativePath, workdirHint } = cmd;
  const workdir = sessionWorkdirs.get(sessionId) ?? workdirHint;
  if (!workdir) {
    send({
      type: "file_content_result",
      requestId,
      content: "",
      error: `No workdir known for session ${sessionId}`,
    });
    return;
  }
  const normalizedWorkdir = deps.path.resolve(workdir);
  // Accept absolute paths (e.g. from Codex) — resolve handles both absolute and relative.
  // The isPathInsideRoot check below ensures the resolved path stays within the workdir.
  const fullPath = deps.path.resolve(normalizedWorkdir, relativePath);
  if (!isPathInsideRoot(normalizedWorkdir, fullPath, deps.path)) {
    send({ type: "file_content_result", requestId, content: "", error: "Path traversal denied" });
    return;
  }

  void (async () => {
    try {
      const realWorkdir = await deps.fs.promises.realpath(normalizedWorkdir);
      const realPath = await deps.fs.promises.realpath(fullPath);
      if (!isPathInsideRoot(realWorkdir, realPath, deps.path)) {
        send({
          type: "file_content_result",
          requestId,
          content: "",
          error: "Path traversal denied",
        });
        return;
      }

      const stats = await deps.fs.promises.stat(realPath);
      if (!stats.isFile()) {
        send({ type: "file_content_result", requestId, content: "", error: "Not a file" });
        return;
      }
      if (stats.size > MAX_FILE_VIEW_BYTES) {
        send({
          type: "file_content_result",
          requestId,
          content: "",
          error: `File too large to preview (${Math.ceil(MAX_FILE_VIEW_BYTES / 1024)} KB max)`,
        });
        return;
      }

      deps.fs.readFile(realPath, (err, content) => {
        if (err) {
          send({ type: "file_content_result", requestId, content: "", error: err.message });
          return;
        }
        if (isLikelyBinaryFile(content)) {
          send({
            type: "file_content_result",
            requestId,
            content: "",
            error: "Binary files are not supported in the file viewer",
          });
          return;
        }
        send({ type: "file_content_result", requestId, content: content.toString("utf-8") });
      });
    } catch (err) {
      send({
        type: "file_content_result",
        requestId,
        content: "",
        error: err instanceof Error ? err.message : "Failed to read file",
      });
    }
  })();
}

/**
 * Handle a `write_file` bridge command. Writes only existing text files inside the workdir.
 */
export function handleWriteFile(
  cmd: BridgeWriteFileCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  deps: { fs: BridgeFsLike; path: BridgePathLike },
): void {
  const { requestId, sessionId, relativePath, content, workdirHint } = cmd;
  const workdir = sessionWorkdirs.get(sessionId) ?? workdirHint;
  if (!workdir) {
    send({
      type: "file_write_result",
      requestId,
      error: `No workdir known for session ${sessionId}`,
    });
    return;
  }
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_VIEW_BYTES) {
    send({
      type: "file_write_result",
      requestId,
      error: `File too large to save (${Math.ceil(MAX_FILE_VIEW_BYTES / 1024)} KB max)`,
    });
    return;
  }

  const normalizedWorkdir = deps.path.resolve(workdir);
  const fullPath = deps.path.resolve(normalizedWorkdir, relativePath);
  if (!isPathInsideRoot(normalizedWorkdir, fullPath, deps.path)) {
    send({ type: "file_write_result", requestId, error: "Path traversal denied" });
    return;
  }

  void (async () => {
    try {
      const realWorkdir = await deps.fs.promises.realpath(normalizedWorkdir);
      const realPath = await deps.fs.promises.realpath(fullPath);
      if (!isPathInsideRoot(realWorkdir, realPath, deps.path)) {
        send({ type: "file_write_result", requestId, error: "Path traversal denied" });
        return;
      }

      const stats = await deps.fs.promises.stat(realPath);
      if (!stats.isFile()) {
        send({ type: "file_write_result", requestId, error: "Not a file" });
        return;
      }

      await deps.fs.promises.writeFile(realPath, content);
      send({ type: "file_write_result", requestId });
    } catch (err) {
      send({
        type: "file_write_result",
        requestId,
        error: err instanceof Error ? err.message : "Failed to write file",
      });
    }
  })();
}

/**
 * Handle a `commit_file_changes` bridge command. Commits current worktree changes in the session.
 */
export async function handleCommitFileChanges(
  cmd: BridgeCommitFileChangesCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  deps: { fs: BridgeFsLike; path: BridgePathLike; gitExec: GitExecFn },
): Promise<void> {
  const { requestId, sessionId, message, workdirHint } = cmd;
  const workdir = sessionWorkdirs.get(sessionId) ?? workdirHint;
  if (!workdir) {
    send({
      type: "file_commit_result",
      requestId,
      error: `No workdir known for session ${sessionId}`,
    });
    return;
  }

  try {
    const realWorkdir = await deps.fs.promises.realpath(deps.path.resolve(workdir));
    const status = await deps.gitExec(["status", "--porcelain=v1", "-z"], realWorkdir);
    const changes = parseWorktreeStatus(status);
    if (changes.length === 0) {
      send({ type: "file_commit_result", requestId, error: "No changes to commit" });
      return;
    }

    const commitMessage = message?.trim() || "Update files from Trace";
    await deps.gitExec(["add", "-A"], realWorkdir);
    await deps.gitExec(["commit", "-m", commitMessage], realWorkdir);
    const commitSha = (await deps.gitExec(["rev-parse", "HEAD"], realWorkdir)).trim();
    send({ type: "file_commit_result", requestId, commitSha });
  } catch (err) {
    send({
      type: "file_commit_result",
      requestId,
      error: err instanceof Error ? err.message : "Failed to commit changes",
    });
  }
}

export async function handleWorktreeChanges(
  cmd: BridgeWorktreeChangesCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  deps: { fs: BridgeFsLike; path: BridgePathLike; gitExec: GitExecFn },
): Promise<void> {
  const workdir = sessionWorkdirs.get(cmd.sessionId) ?? cmd.workdirHint;
  if (!workdir) {
    send({
      type: "worktree_changes_result",
      requestId: cmd.requestId,
      files: [],
      totalCount: 0,
      truncated: false,
      error: `No workdir known for session ${cmd.sessionId}`,
    });
    return;
  }

  try {
    const realWorkdir = await deps.fs.promises.realpath(deps.path.resolve(workdir));
    const status = await deps.gitExec(["status", "--porcelain=v1", "-z"], realWorkdir);
    const paths = parseWorktreeStatus(status);
    const files: BridgeLinkedCheckoutChangedFile[] = [];
    let payloadBytes = 0;
    let truncated = paths.length > MAX_WORKTREE_CHANGE_FILES;
    for (const entry of paths.slice(0, MAX_WORKTREE_CHANGE_FILES)) {
      const file = await buildWorktreeChangedFile(entry, realWorkdir, deps);
      const fileBytes = changedFilePayloadBytes(file);
      if (files.length > 0 && payloadBytes + fileBytes > MAX_WORKTREE_CHANGES_PAYLOAD_BYTES) {
        truncated = true;
        break;
      }
      files.push(file);
      payloadBytes += fileBytes;
    }
    send({
      type: "worktree_changes_result",
      requestId: cmd.requestId,
      files,
      totalCount: paths.length,
      truncated,
    });
  } catch (err) {
    send({
      type: "worktree_changes_result",
      requestId: cmd.requestId,
      files: [],
      totalCount: 0,
      truncated: false,
      error: err instanceof Error ? err.message : "Failed to load worktree changes",
    });
  }
}

export async function handleRevertWorktreeFile(
  cmd: BridgeRevertWorktreeFileCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  deps: { fs: BridgeFsLike; path: BridgePathLike; gitExec: GitExecFn },
): Promise<void> {
  const workdir = sessionWorkdirs.get(cmd.sessionId) ?? cmd.workdirHint;
  if (!workdir) {
    send({
      type: "revert_worktree_file_result",
      requestId: cmd.requestId,
      error: `No workdir known for session ${cmd.sessionId}`,
    });
    return;
  }

  try {
    const realWorkdir = await deps.fs.promises.realpath(deps.path.resolve(workdir));
    const fullPath = deps.path.resolve(realWorkdir, cmd.filePath);
    if (!isPathInsideRoot(realWorkdir, fullPath, deps.path)) {
      send({
        type: "revert_worktree_file_result",
        requestId: cmd.requestId,
        error: "Path traversal denied",
      });
      return;
    }

    const relativePath = deps.path.relative(realWorkdir, fullPath);
    const tracked = await deps
      .gitExec(["ls-files", "--error-unmatch", "--", relativePath], realWorkdir)
      .then(() => true)
      .catch(() => false);
    if (tracked) {
      await deps.gitExec(["checkout", "HEAD", "--", relativePath], realWorkdir);
    } else {
      await deps.gitExec(["clean", "-f", "--", relativePath], realWorkdir);
    }
    send({ type: "revert_worktree_file_result", requestId: cmd.requestId });
  } catch (err) {
    send({
      type: "revert_worktree_file_result",
      requestId: cmd.requestId,
      error: err instanceof Error ? err.message : "Failed to revert file",
    });
  }
}

type WorktreeStatusEntry = { path: string; status: string };

function parseWorktreeStatus(status: string): WorktreeStatusEntry[] {
  const entries = status.split("\0").filter(Boolean);
  const paths: WorktreeStatusEntry[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? "";
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;
    const statusCode = code === "??" ? "A" : code.trim()[0] || "M";
    paths.push({ path, status: statusCode });
    if (code.includes("R") || code.includes("C")) index += 1;
  }
  return paths;
}

async function buildWorktreeChangedFile(
  entry: WorktreeStatusEntry,
  workdir: string,
  deps: { fs: BridgeFsLike; path: BridgePathLike; gitExec: GitExecFn },
): Promise<BridgeLinkedCheckoutChangedFile> {
  const originalRaw = await deps.gitExec(["show", `HEAD:${entry.path}`], workdir).catch(() => "");
  const original = previewTextContent(originalRaw, MAX_WORKTREE_CHANGE_FIELD_BYTES);
  const modifiedContent =
    entry.status === "D"
      ? { content: "", truncated: false }
      : await readWorktreeTextFile(
          workdir,
          entry.path,
          deps,
          MAX_WORKTREE_CHANGE_FIELD_BYTES,
        ).catch(() => ({
          content: "",
          truncated: false,
        }));
  const diffPreview = previewTextContent(
    await deps.gitExec(["diff", "--", entry.path], workdir).catch(() => ""),
    MAX_WORKTREE_CHANGE_FIELD_BYTES,
  );
  const numstat = await deps
    .gitExec(["diff", "--numstat", "--", entry.path], workdir)
    .catch(() => "");
  const [additionsRaw = "0", deletionsRaw = "0"] = numstat.split("\t");
  const fallbackAdditions = modifiedContent.content
    ? modifiedContent.content.split("\n").length
    : 0;
  return {
    path: entry.path,
    status: entry.status,
    additions: Number.parseInt(additionsRaw, 10) || (entry.status === "A" ? fallbackAdditions : 0),
    deletions: Number.parseInt(deletionsRaw, 10) || 0,
    diff: diffPreview.content,
    truncated: diffPreview.truncated,
    originalContent: original.content,
    modifiedContent: modifiedContent.content,
    contentTruncated: original.truncated || modifiedContent.truncated,
  };
}

function changedFilePayloadBytes(file: BridgeLinkedCheckoutChangedFile): number {
  return Buffer.byteLength(
    `${file.path}\0${file.status}\0${file.diff}\0${file.originalContent}\0${file.modifiedContent}`,
    "utf8",
  );
}

function previewTextContent(
  content: string,
  maxBytes = MAX_FILE_VIEW_BYTES,
): { content: string; truncated: boolean } {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) {
    return { content, truncated: false };
  }
  let preview = content.slice(0, maxBytes);
  while (Buffer.byteLength(preview, "utf8") > maxBytes) {
    preview = preview.slice(0, -1);
  }
  return {
    content: preview,
    truncated: true,
  };
}

async function readWorktreeTextFile(
  workdir: string,
  filePath: string,
  deps: { fs: BridgeFsLike; path: BridgePathLike },
  maxBytes = MAX_FILE_VIEW_BYTES,
): Promise<{ content: string; truncated: boolean }> {
  const fullPath = deps.path.resolve(workdir, filePath);
  if (!isPathInsideRoot(workdir, fullPath, deps.path)) {
    return Promise.reject(new Error("Path traversal denied"));
  }
  const stats = await deps.fs.promises.stat(fullPath);
  if (!stats.isFile()) {
    throw new Error("Not a file");
  }
  if (stats.size > maxBytes) {
    return { content: "", truncated: true };
  }
  return new Promise((resolve, reject) => {
    deps.fs.readFile(fullPath, (err, content) => {
      if (err) {
        reject(err);
        return;
      }
      if (isLikelyBinaryFile(content)) {
        resolve({ content: "", truncated: true });
        return;
      }
      resolve({ content: content.toString("utf8"), truncated: false });
    });
  });
}

// --- Shared branch diff / file-at-ref handlers ---

/** Callback-based git command runner, injected by bridges. */
export type GitExecFn = (args: string[], cwd: string) => Promise<string>;

/** Reject refs that could be interpreted as git flags or contain dangerous patterns. */
function hasInvalidGitRef(ref: string): boolean {
  if (!ref || ref.startsWith("-") || ref.includes("..")) {
    return true;
  }
  for (const char of ref) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Handle a `branch_diff` bridge command. Runs git diff --numstat and --name-status,
 * merges results by path.
 */
export async function handleBranchDiff(
  cmd: BridgeBranchDiffCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  gitExec: GitExecFn,
): Promise<void> {
  const { requestId, sessionId, baseBranch, workdirHint } = cmd;
  const workdir = sessionWorkdirs.get(sessionId) ?? workdirHint;
  if (!workdir) {
    send({
      type: "branch_diff_result",
      requestId,
      files: [],
      error: `No workdir known for session ${sessionId}`,
    });
    return;
  }

  if (hasInvalidGitRef(baseBranch)) {
    send({ type: "branch_diff_result", requestId, files: [], error: "Invalid base branch ref" });
    return;
  }

  try {
    const [numstatOut, nameStatusOut] = await Promise.all([
      gitExec(["diff", "--numstat", `${baseBranch}...HEAD`], workdir),
      gitExec(["diff", "--name-status", `${baseBranch}...HEAD`], workdir),
    ]);

    // Parse --name-status: "M\tpath" or "R100\told\tnew"
    const statusMap = new Map<string, string>();
    for (const line of nameStatusOut.split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      const status = parts[0]?.[0] ?? "M"; // First char: A, M, D, R, C
      const filePath = parts.length >= 3 ? parts[2] : parts[1]; // Renames use 3rd column
      if (filePath) statusMap.set(filePath, status);
    }

    // Parse --numstat: "additions\tdeletions\tpath"
    const files: BridgeBranchDiffFile[] = [];
    for (const line of numstatOut.split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
      const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
      const filePath = parts.slice(2).join("\t"); // Handle paths with tabs (rare)
      files.push({
        path: filePath,
        status: statusMap.get(filePath) ?? "M",
        additions: isNaN(additions) ? 0 : additions,
        deletions: isNaN(deletions) ? 0 : deletions,
      });
    }

    send({ type: "branch_diff_result", requestId, files });
  } catch (err) {
    send({
      type: "branch_diff_result",
      requestId,
      files: [],
      error: err instanceof Error ? err.message : "Failed to compute branch diff",
    });
  }
}

/**
 * Handle a `file_at_ref` bridge command. Runs `git show <ref>:<path>`.
 * Returns empty content + error for files that don't exist at the ref.
 */
export async function handleFileAtRef(
  cmd: BridgeFileAtRefCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  gitExec: GitExecFn,
): Promise<void> {
  const { requestId, sessionId, filePath, ref, workdirHint } = cmd;
  const workdir = sessionWorkdirs.get(sessionId) ?? workdirHint;
  if (!workdir) {
    send({
      type: "file_at_ref_result",
      requestId,
      content: "",
      error: `No workdir known for session ${sessionId}`,
    });
    return;
  }

  if (hasInvalidRelativePathSegments(filePath)) {
    send({ type: "file_at_ref_result", requestId, content: "", error: "Path traversal denied" });
    return;
  }

  if (hasInvalidGitRef(ref)) {
    send({ type: "file_at_ref_result", requestId, content: "", error: "Invalid git ref" });
    return;
  }

  try {
    const content = await gitExec(["show", `${ref}:${filePath}`], workdir);
    send({ type: "file_at_ref_result", requestId, content });
  } catch (err) {
    // File doesn't exist at this ref (new file) — return empty content with error
    send({
      type: "file_at_ref_result",
      requestId,
      content: "",
      error: err instanceof Error ? err.message : "Failed to read file at ref",
    });
  }
}

// --- Shared skill listing handler ---

/**
 * Handle a `list_skills` bridge command. Scans user and project slash-command
 * locations for skills and legacy command files, returning the combined list.
 */
export async function handleListSkills(
  cmd: BridgeListSkillsCommand,
  sessionWorkdirs: Map<string, string>,
  send: (msg: BridgeMessage) => void,
  deps: {
    userSkillsDir: string | null;
    fs: BridgeFsLike;
    path: BridgePathLike;
  },
): Promise<void> {
  const {
    requestId,
    sessionId,
    workdirHint,
    includeUserSkills = true,
    includeProjectSkills = true,
  } = cmd;
  const skills: BridgeSkillInfo[] = [];
  const seenNames = new Set<string>();

  async function addDiscoveredCommand(
    content: string,
    source: "user" | "project",
    fallbackName: string,
  ): Promise<void> {
    const metadata = parseSlashCommandFrontmatter(content);
    if (metadata.userInvocable === false) return;

    const name = metadata.name ?? fallbackName;
    if (!name || seenNames.has(name)) return;

    seenNames.add(name);
    skills.push({
      name,
      description: metadata.description ?? extractMarkdownSummary(content) ?? name,
      source,
    });
  }

  async function scanSkillsDir(dir: string, source: "user" | "project"): Promise<void> {
    try {
      const entries = await deps.fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMdPath = deps.path.join(dir, entry.name, "SKILL.md");
        try {
          const content = await readUtf8File(skillMdPath, deps.fs);
          await addDiscoveredCommand(content, source, entry.name);
        } catch {
          // SKILL.md doesn't exist or can't be read — skip
        }
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  async function scanCommandsDir(dir: string, source: "user" | "project"): Promise<void> {
    try {
      const entries = await deps.fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = deps.path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanCommandsDir(entryPath, source);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        try {
          const content = await readUtf8File(entryPath, deps.fs);
          const fallbackName = entry.name.replace(/\.md$/i, "");
          await addDiscoveredCommand(content, source, fallbackName);
        } catch {
          // Command file can't be read — skip
        }
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  try {
    if (deps.userSkillsDir && includeUserSkills) {
      await scanSkillsDir(deps.userSkillsDir, "user");
      await scanCommandsDir(deps.path.resolve(deps.userSkillsDir, "..", "commands"), "user");
    }
    const workdir = sessionWorkdirs.get(sessionId) ?? workdirHint;
    if (workdir && includeProjectSkills) {
      const projectSkillsDir = deps.path.join(workdir, ".claude", "skills");
      await scanSkillsDir(projectSkillsDir, "project");
      await scanCommandsDir(deps.path.join(workdir, ".claude", "commands"), "project");
    }
    send({ type: "skills_result", requestId, skills });
  } catch (err) {
    send({
      type: "skills_result",
      requestId,
      skills: [],
      error: err instanceof Error ? err.message : "Failed to list skills",
    });
  }
}

async function readUtf8File(filePath: string, fsLike: BridgeFsLike): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fsLike.readFile(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data.toString("utf-8"));
    });
  });
}

function parseSlashCommandFrontmatter(content: string): {
  name?: string;
  description?: string;
  userInvocable?: boolean;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};

  const frontmatter = match[1];
  return {
    name: extractFrontmatterValue(frontmatter, "name"),
    description: extractFrontmatterValue(frontmatter, "description"),
    userInvocable: parseFrontmatterBoolean(extractFrontmatterValue(frontmatter, "user-invocable")),
  };
}

function extractFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = frontmatter.match(new RegExp(`^${escapedKey}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function parseFrontmatterBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function extractMarkdownSummary(content: string): string | undefined {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
  if (!body) return undefined;

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  if (lines.length === 0) return undefined;

  return lines[0];
}

// --- Shared attachment download helper ---

/**
 * Download attachments from presigned URLs to temp files.
 * Shared between container and desktop bridges.
 */
export interface AttachmentDownloadDeps {
  fs: {
    promises: {
      mkdir: (p: string, opts: { recursive: boolean }) => Promise<unknown>;
      writeFile: (p: string, data: Buffer) => Promise<void>;
      unlink: (p: string) => Promise<void>;
    };
  };
  path: { join: (...p: string[]) => string };
  tmpdir: () => string;
  randomUUID: () => string;
}

export async function downloadAttachmentsToTempFiles(
  attachmentUrls: string[],
  deps: AttachmentDownloadDeps,
): Promise<string[]> {
  const tmpDir = deps.path.join(deps.tmpdir(), "trace-files");
  await deps.fs.promises.mkdir(tmpDir, { recursive: true });
  return Promise.all(
    attachmentUrls.map(async (url) => {
      let ext = "bin";
      try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.([a-zA-Z0-9]{1,16})(?:$|[?#])/);
        if (match) ext = match[1];
      } catch {
        // Fall back to default extension
      }
      const filePath = deps.path.join(tmpDir, `${deps.randomUUID()}.${ext}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to download attachment: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      await deps.fs.promises.writeFile(filePath, buffer);
      return filePath;
    }),
  );
}

/**
 * Clean up temp attachment files. Errors are silently ignored.
 */
export function cleanupTempAttachments(
  attachmentPaths: string[],
  fs: { promises: { unlink: (p: string) => Promise<void> } },
): void {
  for (const p of attachmentPaths) {
    fs.promises.unlink(p).catch(() => {});
  }
}

export type ImageDownloadDeps = AttachmentDownloadDeps;
export const downloadImagesToTempFiles = downloadAttachmentsToTempFiles;
export const cleanupTempImages = cleanupTempAttachments;

// --- Bridge client interface ---

/** Common interface for all bridge implementations (desktop, cloud container). */
export interface BridgeClient {
  /** Connect to the server's /bridge WebSocket. */
  connect(): void;

  /** Disconnect from the server and clean up all resources. */
  disconnect(): void;

  /** Send a message to the server. */
  send(data: BridgeMessage): void;
}
