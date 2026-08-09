export type SupportedIntegrationCapability = {
  id: string;
  name: string;
  description: string;
  guide: string;
  allowedMethods: string[];
  allowedPathPrefixes: string[];
};

export type SupportedIntegration = {
  id: string;
  name: string;
  provider: string;
  providerConfigKey: string;
  description: string;
  guide: string;
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
    guide:
      'Call GitHub from a generated Node route with trace.integrations.request(request, "github", options). The browser calls only that same-origin app route.',
    capabilities: [
      {
        id: "profile",
        name: "Profile",
        description: "Read the connected GitHub user's profile.",
        guide: 'Use { path: "/user" }. The response includes the connected account\'s login.',
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/user"],
      },
      {
        id: "repositories",
        name: "Repositories",
        description: "Read repositories and their issues and pull requests.",
        guide:
          'Use GET paths under "/repos" for a named repository or "/user/repos" to list the connected account\'s repositories.',
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
    guide:
      'Call Snowflake from a generated Node route with trace.integrations.snowflake.query(request, "snowflake", options). Keep SQL in server code and accept only parameter values from the browser.',
    capabilities: [
      {
        id: "query",
        name: "Read data",
        description: "Run validated, read-only SQL queries.",
        guide:
          "Pass one SELECT or WITH ... SELECT statement and optional typed parameters. Trace rejects writes and multiple statements.",
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
    guide: definition.guide,
    capabilities: definition.capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      description: capability.description,
      guide: capability.guide,
      allowedMethods: [...capability.allowedMethods],
      allowedPathPrefixes: [...capability.allowedPathPrefixes],
    })),
  }));
}

export function supportedIntegration(id: string): SupportedIntegration | undefined {
  const normalizedId = id.trim().toLowerCase();
  return supportedIntegrations().find((integration) => integration.id === normalizedId);
}
