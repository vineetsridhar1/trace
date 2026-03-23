/**
 * Bridge protocol types — shared between desktop BridgeClient and container ContainerBridge.
 * Defines the wire protocol between bridge clients and the server's /bridge WebSocket.
 */

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
}

export interface BridgePrepareCommand {
  type: "prepare";
  sessionId: string;
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
}

export interface BridgeReadFileCommand {
  type: "read_file";
  requestId: string;
  sessionId: string;
  relativePath: string;
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
  | BridgeTerminateCommand
  | BridgePauseCommand
  | BridgeResumeCommand
  | BridgeDeleteCommand
  | BridgeListBranchesCommand
  | BridgeListFilesCommand
  | BridgeReadFileCommand
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
}

export interface BridgeToolSessionId {
  type: "tool_session_id";
  sessionId: string;
  toolSessionId: string;
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
  | BridgeRepoLinked
  | BridgeBranchesResult
  | BridgeFilesResult
  | BridgeFileContentResult
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
