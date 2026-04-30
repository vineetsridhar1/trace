import type { AgentEnvironment, SessionRuntimeInstance } from "@trace/gql";

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
  launcherMetadata?: Record<string, unknown>;
};

export type LocalBridgeSummary = {
  id: string;
  label: string;
  connected: boolean;
  registeredRepos: Array<{ id: string; name: string }>;
};

export function environmentConfig(environment?: AgentEnvironment | null): AgentEnvironmentConfig {
  const config = environment?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return config as AgentEnvironmentConfig;
}

export function formatAdapterType(adapterType: AgentEnvironment["adapterType"]): string {
  return adapterType === "local" ? "Local" : "Provisioned";
}

export function runtimeRepoNames(
  runtime: SessionRuntimeInstance | LocalBridgeSummary,
  repoNamesById?: Map<string, string>,
): string {
  const names =
    "registeredRepos" in runtime
      ? runtime.registeredRepos.map((repo) => repo.name).sort((a, b) => a.localeCompare(b))
      : runtime.registeredRepoIds
          .map((id) => repoNamesById?.get(id) ?? id)
          .sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : "No registered repos";
}
