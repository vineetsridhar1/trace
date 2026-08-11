import type { CodingTool } from "@prisma/client";
import { ValidationError } from "../lib/errors.js";
import { apiTokenService } from "./api-token.js";
import { codexCredentialService } from "./codex-credential.js";

export async function resolveCloudRuntimeCredentialEnv(
  userId: string,
): Promise<Record<string, string>> {
  const [tokens, codexCredential] = await Promise.all([
    apiTokenService.getDecryptedTokens(userId),
    codexCredentialService.getDecryptedCredential(userId),
  ]);
  // Codex supports a dedicated credential as well as the user's OpenAI API
  // key. Prefer the dedicated credential when both are present.
  const codexAuthMethod = codexCredential?.method ?? (tokens.openai ? "api_key" : undefined);
  const codexApiKey =
    codexCredential?.method === "api_key"
      ? codexCredential.credential
      : codexCredential
        ? undefined
        : tokens.openai;

  return {
    ...(tokens.anthropic ? { ANTHROPIC_API_KEY: tokens.anthropic } : {}),
    ...(tokens.openai ? { OPENAI_API_KEY: tokens.openai } : {}),
    ...(codexAuthMethod ? { CODEX_AUTH_METHOD: codexAuthMethod } : {}),
    ...(codexCredential?.method === "access_token"
      ? { CODEX_ACCESS_TOKEN: codexCredential.credential }
      : {}),
    ...(codexApiKey ? { CODEX_API_KEY: codexApiKey } : {}),
    ...(codexCredential?.method === "chatgpt_session"
      ? { CODEX_AUTH_JSON: codexCredential.credential }
      : {}),
    ...(tokens.github ? { GITHUB_TOKEN: tokens.github } : {}),
    ...(tokens.ssh_key ? { SSH_PRIVATE_KEY: tokens.ssh_key } : {}),
  };
}

export function assertCloudToolCredentialAvailable(
  tool: CodingTool | string,
  env: Record<string, string>,
): void {
  if (tool === "claude_code" && !env.ANTHROPIC_API_KEY?.trim()) {
    throw new ValidationError(
      "Cannot start a Claude Code cloud session: add an Anthropic API key in Settings → API keys.",
    );
  }

  if (tool !== "codex") return;

  const method = env.CODEX_AUTH_METHOD?.trim();
  const hasCredential =
    (method === "api_key" && !!env.CODEX_API_KEY?.trim()) ||
    (method === "access_token" && !!env.CODEX_ACCESS_TOKEN?.trim()) ||
    (method === "chatgpt_session" && !!env.CODEX_AUTH_JSON?.trim());
  if (!hasCredential) {
    throw new ValidationError(
      "Cannot start a Codex cloud session: add a ChatGPT session, Codex access token, or OpenAI API key in Settings → API keys.",
    );
  }
}

export async function assertCloudToolCredentialConfigured(
  userId: string,
  tool: CodingTool | string,
): Promise<void> {
  const env = await resolveCloudRuntimeCredentialEnv(userId);
  assertCloudToolCredentialAvailable(tool, env);
}
