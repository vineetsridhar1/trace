import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiTokenService } from "./api-token.js";
import { codexCredentialService } from "./codex-credential.js";
import {
  assertCloudToolCredentialAvailable,
  assertCloudToolCredentialConfigured,
  resolveCloudRuntimeCredentialEnv,
} from "./cloud-runtime-credentials.js";

vi.mock("./api-token.js", () => ({
  apiTokenService: { getDecryptedTokens: vi.fn() },
}));

vi.mock("./codex-credential.js", () => ({
  codexCredentialService: { getDecryptedCredential: vi.fn() },
}));

describe("cloud runtime credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiTokenService.getDecryptedTokens).mockResolvedValue({});
    vi.mocked(codexCredentialService.getDecryptedCredential).mockResolvedValue(null);
  });

  it("rejects a Claude Code cloud session without an Anthropic key", async () => {
    await expect(assertCloudToolCredentialConfigured("user-1", "claude_code")).rejects.toThrow(
      "add an Anthropic API key in Settings → API keys",
    );
  });

  it("accepts a non-empty Anthropic key", () => {
    expect(() =>
      assertCloudToolCredentialAvailable("claude_code", {
        ANTHROPIC_API_KEY: "anthropic-key",
      }),
    ).not.toThrow();
  });

  it("rejects Codex when no supported credential is configured", async () => {
    await expect(assertCloudToolCredentialConfigured("user-1", "codex")).rejects.toThrow(
      "add a ChatGPT session, Codex access token, or OpenAI API key",
    );
  });

  it("uses an OpenAI API key as the Codex API-key credential", async () => {
    vi.mocked(apiTokenService.getDecryptedTokens).mockResolvedValue({
      openai: "openai-key",
    });

    const env = await resolveCloudRuntimeCredentialEnv("user-1");

    expect(env).toMatchObject({
      OPENAI_API_KEY: "openai-key",
      CODEX_AUTH_METHOD: "api_key",
      CODEX_API_KEY: "openai-key",
    });
    expect(() => assertCloudToolCredentialAvailable("codex", env)).not.toThrow();
  });

  it("prefers a dedicated Codex credential over an OpenAI API key", async () => {
    vi.mocked(apiTokenService.getDecryptedTokens).mockResolvedValue({
      openai: "openai-key",
    });
    vi.mocked(codexCredentialService.getDecryptedCredential).mockResolvedValue({
      method: "chatgpt_session",
      credential: "chatgpt-json",
    });

    const env = await resolveCloudRuntimeCredentialEnv("user-1");

    expect(env).toMatchObject({
      CODEX_AUTH_METHOD: "chatgpt_session",
      CODEX_AUTH_JSON: "chatgpt-json",
    });
    expect(env.CODEX_API_KEY).toBeUndefined();
    expect(() => assertCloudToolCredentialAvailable("codex", env)).not.toThrow();
  });

  it("rejects blank credential values", () => {
    expect(() =>
      assertCloudToolCredentialAvailable("codex", {
        CODEX_AUTH_METHOD: "access_token",
        CODEX_ACCESS_TOKEN: "   ",
      }),
    ).toThrow("Cannot start a Codex cloud session");
  });
});
