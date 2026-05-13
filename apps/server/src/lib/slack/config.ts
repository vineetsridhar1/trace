const REQUIRED_SLACK_ENV = [
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SLACK_SIGNING_SECRET",
  "SLACK_REDIRECT_URI",
] as const;

export function getMissingSlackConfig(): string[] {
  return REQUIRED_SLACK_ENV.filter((key) => !process.env[key]?.trim());
}

export function isSlackConfigured(): boolean {
  return getMissingSlackConfig().length === 0;
}

export function slackSessionHosting(): "cloud" | "local" {
  return process.env.SLACK_SESSION_HOSTING === "local" ? "local" : "cloud";
}

export function slackInteractionsUrl(): string | null {
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!redirectUri) return null;
  const url = new URL(redirectUri);
  url.pathname = "/slack/interactions";
  url.search = "";
  url.hash = "";
  return url.toString();
}
