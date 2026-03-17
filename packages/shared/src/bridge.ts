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

export type BridgeCommand =
  | BridgeRunCommand
  | BridgeSendCommand
  | BridgePrepareCommand
  | BridgeTerminateCommand
  | BridgePauseCommand
  | BridgeResumeCommand
  | BridgeDeleteCommand;

// --- Bridge → Server messages ---

export interface BridgeRuntimeHello {
  type: "runtime_hello";
  instanceId: string;
  label: string;
  hostingMode: "cloud" | "local";
  supportedTools: string[];
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

export type BridgeMessage =
  | BridgeRuntimeHello
  | BridgeRuntimeHeartbeat
  | BridgeRegisterSession
  | BridgeSessionOutput
  | BridgeSessionComplete
  | BridgeWorkspaceReady
  | BridgeWorkspaceFailed
  | BridgeToolSessionId;

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
