import { useState } from "react";
import { RefreshCw } from "lucide-react";
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
    <div className="mt-3 space-y-2">
      <Input
        type="password"
        autoComplete="off"
        placeholder={`${providerName} API key`}
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void saveAndRetry();
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button size="sm" disabled={!apiKey.trim() || saving} onClick={() => void saveAndRetry()}>
        <RefreshCw />
        {saving ? "Saving…" : sessionId ? "Save key and retry" : "Save API key"}
      </Button>
    </div>
  );
}
