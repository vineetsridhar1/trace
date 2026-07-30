import type { RepoApplicationConfig } from "@trace/gql";

export function withRepoApplicationConfigDefaults(
  config: Partial<RepoApplicationConfig> | null | undefined,
): RepoApplicationConfig {
  return {
    setupScripts: config?.setupScripts ?? [],
    runScripts: config?.runScripts ?? [],
    applications: config?.applications ?? [],
  };
}
