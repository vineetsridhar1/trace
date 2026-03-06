export const config = {
  port: parseInt(process.env.PORT || "3100", 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/trace?schema=public",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  aiProvider: (process.env.AI_PROVIDER || "openai") as "openai" | "anthropic",
  storagePath: process.env.STORAGE_PATH || "./data/storage",
  jwtSecret: process.env.JWT_SECRET || "trace-dev-secret-change-in-production",
  githubClientId: process.env.GITHUB_CLIENT_ID || "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  webAppUrl: process.env.WEB_APP_URL || "http://localhost:5180",
  githubWebCallbackUrl:
    process.env.GITHUB_WEB_CALLBACK_URL ||
    "http://localhost:3100/auth/github/callback/web",
};
