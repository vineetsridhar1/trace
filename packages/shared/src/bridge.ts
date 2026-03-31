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
  interactionMode?: string;
  toolSessionId?: string;
  checkpointContext?: GitCheckpointContext | null;
}

export interface BridgeSendCommand {
  type: "send";
  sessionId: string;
  prompt: string;
  cwd?: string;
  tool?: string;
  model?: string;
  interactionMode?: string;
  toolSessionId?: string;
  checkpointContext?: GitCheckpointContext | null;
}

export interface BridgePrepareCommand {
  type: "prepare";
  sessionId: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  repoId: string;
  repoName: string;
  repoRemoteUrl: string;
  defaultBranch: string;
  branch?: string;
  checkpointSha?: string;
  readOnly?: boolean;
}

export interface BridgeUpgradeWorkspaceCommand {
  type: "upgrade_workspace";
  sessionId: string;
  /** When set, the worktree and branch are keyed by this ID so all sessions in the group share the same workspace. */
  sessionGroupId?: string;
  repoId: string;
  repoName: string;
  repoRemoteUrl: string;
  defaultBranch: string;
  branch?: string;
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

// --- Terminal commands (Server → Bridge) ---

export interface BridgeTerminalCreateCommand {
  type: "terminal_create";
  terminalId: string;
  sessionId: string;
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
  | BridgeListFilesCommand
  | BridgeReadFileCommand
  | BridgeBranchDiffCommand
  | BridgeFileAtRefCommand
  | BridgeTerminalCreateCommand
  | BridgeTerminalInputCommand
  | BridgeTerminalResizeCommand
  | BridgeTerminalDestroyCommand;

// --- Bridge → Server messages ---

export interface BridgeRuntimeHello {
  type: "runtime_hello";
  instanceId: string;
  label: string;
  hostingMode: "cloud" | "local";
  supportedTools: string[];
  /** Repo IDs this bridge has locally registered (device bridges only). Empty for cloud. */
  registeredRepoIds: string[];
  /** Active terminal ptys still running on this bridge (reported on reconnect). */
  activeTerminals?: Array<{ terminalId: string; sessionId: string }>;
}

export interface BridgeRuntimeHeartbeat {
  type: "runtime_heartbeat";
  instanceId: string;
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
}

export interface BridgeWorkspaceFailed {
  type: "workspace_failed";
  sessionId: string;
  error: string;
  /** When false, the error is a configuration issue that won't resolve by retrying. */
  retryable?: boolean;
}

export interface BridgeToolSessionId {
  type: "tool_session_id";
  sessionId: string;
  toolSessionId: string;
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

export interface BridgeBranchesResult {
  type: "branches_result";
  requestId: string;
  branches: string[];
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

export type BridgeMessage =
  | BridgeRuntimeHello
  | BridgeRuntimeHeartbeat
  | BridgeRegisterSession
  | BridgeSessionOutput
  | BridgeSessionComplete
  | BridgeWorkspaceReady
  | BridgeWorkspaceFailed
  | BridgeToolSessionId
  | BridgeGitCheckpoint
  | BridgeRepoLinked
  | BridgeBranchesResult
  | BridgeFilesResult
  | BridgeFileContentResult
  | BridgeBranchDiffResult
  | BridgeFileAtRefResult
  | BridgeTerminalReady
  | BridgeTerminalOutput
  | BridgeTerminalExit
  | BridgeTerminalError;

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
export const WALK_IGNORE = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", ".venv", "vendor", ".cache", "coverage"]);
export const MAX_FILE_VIEW_BYTES = 512 * 1024;
const BINARY_DETECTION_SAMPLE_BYTES = 8 * 1024;

/**
 * Recursively walk a directory, returning relative file paths.
 * Requires Node `fs` and `path` — only usable in bridge/server contexts, not browser.
 */
export async function walkDir(
  root: string,
  dir: string,
  maxDepth: number,
  fsModule: { promises: { readdir: (p: string, opts: { withFileTypes: true }) => Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>> } },
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
  readFile: (
    path: string,
    cb: (err: NodeJS.ErrnoException | null, data: Buffer) => void,
  ) => void;
  promises: {
    readdir: (
      p: string,
      opts: { withFileTypes: true },
    ) => Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>>;
    realpath: (p: string) => Promise<string>;
    stat: (p: string) => Promise<{ size: number; isFile: () => boolean }>;
  };
}
export interface BridgePathLike {
  resolve: (...p: string[]) => string;
  join: (...p: string[]) => string;
  relative: (from: string, to: string) => string;
  sep: string;
}
/** Callback-based git ls-files runner, injected by bridges to avoid Node child_process type issues. */
export type GitLsFilesFn = (
  cwd: string,
  cb: (err: Error | null, files: string[]) => void,
) => void;

function isPathInsideRoot(root: string, target: string, pathModule: BridgePathLike): boolean {
  return target === root || target.startsWith(root + pathModule.sep);
}

function hasInvalidRelativePathSegments(relativePath: string): boolean {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\")) {
    return true;
  }
  return relativePath
    .split("/")
    .some((part) => part.length === 0 || part === "." || part === "..");
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
    send({ type: "files_result", requestId, files: [], error: `No workdir known for session ${sessionId}` });
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
    send({ type: "file_content_result", requestId, content: "", error: `No workdir known for session ${sessionId}` });
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
        send({ type: "file_content_result", requestId, content: "", error: "Path traversal denied" });
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

// --- Shared branch diff / file-at-ref handlers ---

/** Callback-based git command runner, injected by bridges. */
export type GitExecFn = (
  args: string[],
  cwd: string,
) => Promise<string>;

/** Reject refs that could be interpreted as git flags or contain dangerous patterns. */
function hasInvalidGitRef(ref: string): boolean {
  return !ref || ref.startsWith("-") || ref.includes("..") || /[\x00-\x1f\x7f]/.test(ref);
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
    send({ type: "branch_diff_result", requestId, files: [], error: `No workdir known for session ${sessionId}` });
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
    send({ type: "file_at_ref_result", requestId, content: "", error: `No workdir known for session ${sessionId}` });
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
