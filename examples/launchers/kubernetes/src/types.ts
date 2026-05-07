export type TraceRepo = {
  id: string;
  name: string;
  remoteUrl: string;
  defaultBranch: string;
  branch: string | null;
  checkpointSha: string | null;
  readOnly: boolean;
};

export type StartSessionRequest = {
  sessionId: string;
  sessionGroupId: string | null;
  orgId: string;
  runtimeInstanceId: string;
  runtimeToken: string;
  runtimeTokenExpiresAt: string;
  runtimeTokenScope: "session";
  bridgeUrl: string;
  repo: TraceRepo | null;
  tool: "claude_code" | "codex";
  model: string | null;
  reasoningEffort: string | null;
  bootstrapEnv: Record<string, string>;
  metadata: {
    requestedBy: string;
    environmentId: string;
    launcherMetadata: Record<string, unknown>;
  };
};

export type StopSessionRequest = {
  sessionId: string;
  runtimeId: string;
  reason: string;
};

export type SessionStatusRequest = {
  runtimeId: string;
};

export type TraceRuntimeStatus =
  | "unknown"
  | "provisioning"
  | "booting"
  | "connecting"
  | "connected"
  | "stopping"
  | "stopped"
  | "failed";

export type RuntimeRecord = {
  id: string;
  namespace: string;
  label: string;
};

export type RuntimeStatusResponse = {
  status: TraceRuntimeStatus;
  message?: string;
  metadata?: Record<string, unknown>;
};
