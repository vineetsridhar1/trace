import type { AgentEnvironmentAdapterType } from "@trace/gql";

export const ANY_LOCAL_RUNTIME = "__any_accessible_local__";

export type RuntimeEnvDraft = {
  name: string;
  secretId: string;
};

export type AgentEnvironmentDraft = {
  name: string;
  adapterType: AgentEnvironmentAdapterType;
  enabled: boolean;
  isDefault: boolean;
  runtimeSelection: string;
  startUrl: string;
  stopUrl: string;
  statusUrl: string;
  authSecretId: string;
  startupTimeoutSeconds: string;
  runtimeEnv: RuntimeEnvDraft[];
  launcherMetadata: string;
};

export type UpdateAgentEnvironmentDraft = <K extends keyof AgentEnvironmentDraft>(
  key: K,
  value: AgentEnvironmentDraft[K],
) => void;
