import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { RETRY_SESSION_CONNECTION_MUTATION } from "@trace/client-core";
import { gql } from "@urql/core";
import type { ApiTokenProvider } from "@trace/gql";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const SET_API_TOKEN = gql`
  mutation SetApiTokenFromRecoveryCard($input: SetApiTokenInput!) {
    setApiToken(input: $input) {
      provider
      isSet
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
  const providerName = provider === "anthropic" ? "Anthropic" : "OpenAI";

  const saveAndRetry = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(SET_API_TOKEN, { input: { provider, token: apiKey.trim() } })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      if (sessionId) {
        const retry = await client
          .mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId })
          .toPromise();
        if (retry.error) throw new Error(retry.error.message);
      }
      setApiKey("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save API key");
    } finally {
      setSaving(false);
    }
  };

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
        className="h-11 min-w-0 flex-1 bg-background"
      />
      <Button
        className="h-11 px-5"
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
