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
  imageUrls?: string[];
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
  /** Pre-assigned animal slug for the worktree. If absent, the bridge generates one. */
  slug?: string;
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
  | BridgeListSkillsCommand
  | BridgeLinkedCheckoutStatusCommand
  | BridgeLinkLinkedCheckoutRepoCommand
  | BridgeSyncLinkedCheckoutCommand
  | BridgeRestoreLinkedCheckoutCommand
  | BridgeSetLinkedCheckoutAutoSyncCommand
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
  /** Animal slug used for this worktree (reported back so the server can store it). */
  slug?: string;
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
}

export interface BridgeLinkedCheckoutActionResultPayload {
  ok: boolean;
  status: BridgeLinkedCheckoutStatus;
  error: string | null;
}

export interface BridgeLinkedCheckoutStatusResult {
  type: "linked_checkout_status_result";
  requestId: string;
  status: BridgeLinkedCheckoutStatus;
}

export interface BridgeLinkedCheckoutActionResult {
  type: "linked_checkout_action_result";
  requestId: string;
  action: "link_repo" | "sync" | "restore" | "set_auto_sync";
  result: BridgeLinkedCheckoutActionResultPayload;
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
  | BridgeLinkedCheckoutStatusResult
  | BridgeLinkedCheckoutActionResult
  | BridgeBranchesResult
  | BridgeFilesResult
  | BridgeFileContentResult
  | BridgeBranchDiffResult
  | BridgeFileAtRefResult
  | BridgeSkillsResult
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

// --- Shared image download helper ---

/**
 * Download images from presigned URLs to temp files.
 * Shared between container and desktop bridges.
 */
export async function downloadImagesToTempFiles(
  imageUrls: string[],
  deps: {
    fs: { promises: { mkdir: (p: string, opts: { recursive: boolean }) => Promise<unknown>; writeFile: (p: string, data: Buffer) => Promise<void>; unlink: (p: string) => Promise<void> } };
    path: { join: (...p: string[]) => string };
    tmpdir: () => string;
    randomUUID: () => string;
  },
): Promise<string[]> {
  const tmpDir = deps.path.join(deps.tmpdir(), "trace-images");
  await deps.fs.promises.mkdir(tmpDir, { recursive: true });
  return Promise.all(
    imageUrls.map(async (url) => {
      let ext = "png";
      try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
        if (match) ext = match[1];
      } catch {
        // Fall back to default extension
      }
      const filePath = deps.path.join(tmpDir, `${deps.randomUUID()}.${ext}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      await deps.fs.promises.writeFile(filePath, buffer);
      return filePath;
    }),
  );
}

/**
 * Clean up temp image files. Errors are silently ignored.
 */
export function cleanupTempImages(
  imagePaths: string[],
  fs: { promises: { unlink: (p: string) => Promise<void> } },
): void {
  for (const p of imagePaths) {
    fs.promises.unlink(p).catch(() => {});
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
