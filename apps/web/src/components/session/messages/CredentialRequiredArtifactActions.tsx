import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { RETRY_SESSION_CONNECTION_MUTATION } from "@trace/client-core";
import { gql } from "@urql/core";
import type { ApiTokenProvider } from "@trace/gql";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { CodexAuthenticationDialog } from "../../settings/CodexAuthenticationDialog";

const SET_API_TOKEN = gql`
  mutation SetApiTokenFromRecoveryCard($input: SetApiTokenInput!) {
    setApiToken(input: $input) {
      provider
      isSet
    }
  }
`;

const SET_CODEX_CREDENTIAL = gql`
  mutation SetCodexCredentialFromRecoveryCard($input: SetCodexCredentialInput!) {
    setCodexCredential(input: $input) {
      method
      updatedAt
    }
  }
`;

export function CredentialRequiredArtifactActions({
  provider,
  sessionId,
}: {
  provider: Extract<ApiTokenProvider, "anthropic" | "openai">;
  sessionId?: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codexAuthenticationOpen, setCodexAuthenticationOpen] = useState(false);
  const providerName = provider === "anthropic" ? "Anthropic" : "OpenAI";

  const retrySession = async () => {
    if (!sessionId) return;
    const retry = await client
      .mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId })
      .toPromise();
    if (retry.error) throw new Error(retry.error.message);
  };

  const saveAndRetry = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(SET_API_TOKEN, { input: { provider, token: apiKey.trim() } })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      await retrySession();
      setApiKey("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save API key");
    } finally {
      setSaving(false);
    }
  };

  const saveCodexCredential = async (
    method: "chatgpt_session" | "access_token" | "api_key",
    credential: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(SET_CODEX_CREDENTIAL, { input: { method, credential } })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      await retrySession();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Could not save Codex credential";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  };

  if (provider === "openai") {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 max-sm:w-full">
        <Button
          className="h-9 px-4 text-xs"
          disabled={saving}
          onClick={() => setCodexAuthenticationOpen(true)}
        >
          Connect Codex
          <ArrowRight />
        </Button>
        {error && <p className="w-full text-xs text-destructive">{error}</p>}
        <CodexAuthenticationDialog
          open={codexAuthenticationOpen}
          onOpenChange={setCodexAuthenticationOpen}
          onSave={saveCodexCredential}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:w-full max-sm:flex-wrap">
      <Input
        type="password"
        autoComplete="off"
        placeholder="Paste API key"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void saveAndRetry();
        }}
        aria-label={`${providerName} API key`}
        className="h-9 min-w-0 flex-1 bg-background text-sm"
      />
      <Button
        className="h-9 px-4 text-xs"
        disabled={!apiKey.trim() || saving}
        onClick={() => void saveAndRetry()}
      >
        {saving ? "Connecting…" : "Connect"}
        <ArrowRight />
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
