export type SupportedIntegrationCapability = {
  id: string;
  name: string;
  description: string;
  allowedMethods: string[];
  allowedPathPrefixes: string[];
};

export type SupportedIntegration = {
  id: string;
  name: string;
  provider: string;
  providerConfigKey: string;
  description: string;
  capabilities: SupportedIntegrationCapability[];
};

const definitions = [
  {
    id: "github",
    name: "GitHub",
    provider: "GitHub",
    providerConfigKeyEnv: "NANGO_GITHUB_INTEGRATION_KEY",
    defaultProviderConfigKey: "github-getting-started",
    description: "Profiles, repositories, issues, and pull requests.",
    capabilities: [
      {
        id: "profile",
        name: "Profile",
        description: "Read the connected GitHub user's profile.",
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/user"],
      },
      {
        id: "repositories",
        name: "Repositories",
        description: "Read repositories and their issues and pull requests.",
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/repos", "/user/repos"],
      },
    ],
  },
  {
    id: "snowflake",
    name: "Snowflake",
    provider: "Snowflake",
    providerConfigKeyEnv: "NANGO_SNOWFLAKE_INTEGRATION_KEY",
    defaultProviderConfigKey: "snowflake",
    description: "Run read-only analytics queries with controlled identity selection.",
    capabilities: [
      {
        id: "query",
        name: "Read data",
        description: "Run validated, read-only SQL queries.",
        allowedMethods: ["POST"],
        allowedPathPrefixes: ["/api/v2/statements"],
      },
    ],
  },
] as const;

export function supportedIntegrations(): SupportedIntegration[] {
  return definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    provider: definition.provider,
    providerConfigKey:
      process.env[definition.providerConfigKeyEnv]?.trim() || definition.defaultProviderConfigKey,
    description: definition.description,
    capabilities: definition.capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      description: capability.description,
      allowedMethods: [...capability.allowedMethods],
      allowedPathPrefixes: [...capability.allowedPathPrefixes],
    })),
  }));
}

export function supportedIntegration(id: string): SupportedIntegration | undefined {
  const normalizedId = id.trim().toLowerCase();
  return supportedIntegrations().find((integration) => integration.id === normalizedId);
}
