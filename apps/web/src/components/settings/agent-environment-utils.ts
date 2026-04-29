import type { AgentEnvironment, CodingTool, SessionRuntimeInstance } from "@trace/gql";

export const CODING_TOOL_OPTIONS: Array<{ value: CodingTool; label: string }> = [
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

export type AgentEnvironmentConfig = Record<string, unknown> & {
  runtimeInstanceId?: string;
  runtimeSelection?: string;
  startUrl?: string;
  stopUrl?: string;
  statusUrl?: string;
  startupTimeoutSeconds?: number;
  deprovisionPolicy?: "on_session_end" | "manual";
  auth?: {
    type?: "bearer" | "hmac";
    secretId?: string;
  };
  capabilities?: {
    supportedTools?: CodingTool[];
  };
  launcherMetadata?: Record<string, unknown>;
};

export function environmentConfig(environment?: AgentEnvironment | null): AgentEnvironmentConfig {
  const config = environment?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return config as AgentEnvironmentConfig;
}

export function supportedToolsFromConfig(config: AgentEnvironmentConfig): CodingTool[] {
  const tools = config.capabilities?.supportedTools;
  return Array.isArray(tools) ? tools.filter(isCodingTool) : [];
}

export function isCodingTool(value: unknown): value is CodingTool {
  return value === "claude_code" || value === "codex";
}

export function formatAdapterType(adapterType: AgentEnvironment["adapterType"]): string {
  return adapterType === "local" ? "Local" : "Provisioned";
}

export function runtimeRepoNames(
  runtime: SessionRuntimeInstance,
  repoNamesById: Map<string, string>,
): string {
  const names = runtime.registeredRepoIds
    .map((id) => repoNamesById.get(id) ?? id)
    .sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : "No registered repos";
}
