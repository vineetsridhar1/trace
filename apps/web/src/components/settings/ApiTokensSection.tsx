import { useState, useEffect, useCallback } from "react";
import { Key, Trash2, Check, Eye, EyeOff, Github } from "lucide-react";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ClaudeIcon, CodexIcon } from "../ui/tool-icons";
import { CodexAuthenticationDialog } from "./CodexAuthenticationDialog";

const API_TOKENS_QUERY = gql`
  query MyApiTokens {
    myApiTokens {
      provider
      isSet
      updatedAt
    }
    myCodexCredential {
      method
      updatedAt
    }
  }
`;

const SET_API_TOKEN = gql`
  mutation SetApiToken($input: SetApiTokenInput!) {
    setApiToken(input: $input) {
      provider
      isSet
      updatedAt
    }
  }
`;

const DELETE_API_TOKEN = gql`
  mutation DeleteApiToken($provider: ApiTokenProvider!) {
    deleteApiToken(provider: $provider)
  }
`;

const SET_CODEX_CREDENTIAL = gql`
  mutation SetCodexCredential($input: SetCodexCredentialInput!) {
    setCodexCredential(input: $input) { method updatedAt }
  }
`;

const DELETE_CODEX_CREDENTIAL = gql`
  mutation DeleteCodexCredential {
    deleteCodexCredential
  }
`;

interface TokenStatus {
  provider: string;
  isSet: boolean;
  updatedAt: string | null;
}

const PROVIDER_META: Record<string, { label: string; placeholder: string; description: string }> = {
  anthropic: {
    label: "Anthropic",
    placeholder: "sk-ant-...",
    description: "Used to run Claude Code sessions with your personal Anthropic account",
  },
  openai: {
    label: "OpenAI",
    placeholder: "sk-...",
    description: "Used for OpenAI API integrations and Codex API-key sessions",
  },
  github: {
    label: "GitHub",
    placeholder: "ghp_...",
    description: "Used for cloud containers, repository files, diffs, and webhooks",
  },
  ssh_key: {
    label: "SSH private key",
    placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----",
    description: "Used by cloud sessions to access repositories over SSH",
  },
  codex: {
    label: "Codex",
    placeholder: "",
    description: "Authenticate with ChatGPT, a Codex access token, or an OpenAI API key",
  },
};

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "anthropic") {
    return <ClaudeIcon className="h-5 w-5 object-contain" />;
  }
  if (provider === "openai") {
    return <CodexIcon className="h-5 w-5" />;
  }
  if (provider === "codex") {
    return <CodexIcon className="h-5 w-5" />;
  }
  if (provider === "github") {
    return <Github size={20} />;
  }
  return <Key size={18} className="text-muted-foreground" />;
}

export function ApiTokensSection() {
  const user = useAuthStore((s: { user: { id: string } | null }) => s.user);
  const isDesktopShell = typeof window !== "undefined" && typeof window.trace !== "undefined";
  const [tokens, setTokens] = useState<TokenStatus[]>([]);
  const [codexCredential, setCodexCredential] = useState<{ method: string; updatedAt: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingGithubToken, setImportingGithubToken] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [codexAuthenticationOpen, setCodexAuthenticationOpen] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!user) return;
    const result = await client.query(API_TOKENS_QUERY, {}).toPromise();
    if (result.data?.myApiTokens) {
      setTokens(result.data.myApiTokens as TokenStatus[]);
      setCodexCredential(result.data.myCodexCredential as { method: string; updatedAt: string } | null);
    }
  }, [user]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  function startEditing(provider: string) {
    setEditing(provider);
    setInputValue("");
    setShowInput(false);
    setErrorMessage(null);
  }

  async function saveCodexCredential(
    method: "chatgpt_session" | "access_token" | "api_key",
    credential: string,
  ) {
    const result = await client.mutation(SET_CODEX_CREDENTIAL, { input: { method, credential } }).toPromise();
    if (result.error) throw new Error(result.error.message);
    fetchTokens();
  }

  async function saveToken(provider: string, tokenValue: string) {
    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await client
        .mutation(SET_API_TOKEN, {
          input: { provider, token: tokenValue },
        })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      setEditing(null);
      setInputValue("");
      setShowInput(false);
      // Refetch to get the updated state from the server
      fetchTokens();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save token");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(provider: string) {
    if (!inputValue.trim()) return;
    await saveToken(
      provider,
      provider === "ssh_key" || provider === "codex_auth_json" ? inputValue : inputValue.trim(),
    );
  }

  async function handleUseGithubCliToken() {
    if (importingGithubToken || saving) return;

    if (!window.trace?.getGithubAuthToken) {
      setErrorMessage("Restart the desktop app to load GitHub CLI token import.");
      return;
    }

    setImportingGithubToken(true);
    setErrorMessage(null);
    try {
      const token = await window.trace.getGithubAuthToken();
      await saveToken("github", token);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to read GitHub CLI token",
      );
    } finally {
      setImportingGithubToken(false);
    }
  }

  async function handleDelete(provider: string) {
    if (provider === "codex") {
      await client.mutation(DELETE_CODEX_CREDENTIAL, {}).toPromise();
      fetchTokens();
      return;
    }
    await client.mutation(DELETE_API_TOKEN, { provider }).toPromise();
    // Refetch to get the updated state from the server
    fetchTokens();
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">API Keys</h2>
        <p className="text-sm text-muted-foreground">
          Tokens are encrypted and used only for integrations that need them.
        </p>
      </div>

      <div className="space-y-3">
        {[
          ...tokens,
          {
            provider: "codex",
            isSet: codexCredential !== null,
            updatedAt: null,
          },
        ].map((token: TokenStatus) => {
          const meta = PROVIDER_META[token.provider];
          if (!meta) return null;
          const isEditing = editing === token.provider;
          const canShowGithubCliImport = token.provider === "github" && isDesktopShell;
          const canAuthenticateCodex = token.provider === "codex";

          return (
            <div
              key={token.provider}
              className="rounded-lg border border-border bg-surface-deep p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={token.provider} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {token.isSet && !isEditing && (
                    <>
                      <span className="flex items-center gap-1 text-xs text-emerald-500">
                        <Check size={12} />
                        Configured
                      </span>
                      {canShowGithubCliImport && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUseGithubCliToken}
                          disabled={saving || importingGithubToken}
                          className="gap-2"
                        >
                          <Github size={14} />
                          {importingGithubToken ? "Importing..." : "Import from CLI"}
                        </Button>
                      )}
                      {canAuthenticateCodex && (
                        <Button variant="outline" size="sm" onClick={() => setCodexAuthenticationOpen(true)}>
                          Authenticate Codex
                        </Button>
                      )}
                      {!canAuthenticateCodex && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEditing(token.provider)}
                        >
                          <Key size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(token.provider)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </>
                  )}
                  {!token.isSet && !isEditing && (
                    <>
                      {canAuthenticateCodex && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCodexAuthenticationOpen(true)}
                        >
                          Authenticate Codex
                        </Button>
                      )}
                      {canShowGithubCliImport && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUseGithubCliToken}
                          disabled={saving || importingGithubToken}
                          className="gap-2"
                        >
                          <Github size={14} />
                          {importingGithubToken ? "Importing..." : "Import from CLI"}
                        </Button>
                      )}
                      {!canAuthenticateCodex && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(token.provider)}
                        >
                          Add key
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!isEditing && errorMessage && canShowGithubCliImport && (
                <p className="mt-2 text-xs text-destructive">{errorMessage}</p>
              )}

              {isEditing && (
                <div className="mt-3 space-y-2">
                  {token.provider === "ssh_key" ? (
                    <Textarea
                      placeholder={meta.placeholder}
                      value={inputValue}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setInputValue(e.target.value)
                      }
                      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                        if (e.key === "Escape") {
                          setEditing(null);
                          setInputValue("");
                          setErrorMessage(null);
                        }
                      }}
                      className="font-mono text-xs min-h-[120px]"
                      autoFocus
                    />
                  ) : (
                    <div className="relative">
                      <Input
                        type={showInput ? "text" : "password"}
                        placeholder={meta.placeholder}
                        value={inputValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setInputValue(e.target.value)
                        }
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === "Enter") handleSave(token.provider);
                          if (e.key === "Escape") {
                            setEditing(null);
                            setInputValue("");
                            setErrorMessage(null);
                          }
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowInput(!showInput)}
                      >
                        {showInput ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  )}
                  {canShowGithubCliImport && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUseGithubCliToken}
                      disabled={saving || importingGithubToken}
                      className="gap-2"
                    >
                      <Github size={14} />
                      {importingGithubToken ? "Importing..." : "Import from GitHub CLI"}
                    </Button>
                  )}
                  {errorMessage && (
                    <p className="text-xs text-destructive">{errorMessage}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(token.provider)}
                      disabled={!inputValue.trim() || saving || importingGithubToken}
                    >
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(null);
                        setInputValue("");
                        setErrorMessage(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <CodexAuthenticationDialog
        open={codexAuthenticationOpen}
        onOpenChange={setCodexAuthenticationOpen}
        onSave={saveCodexCredential}
      />
    </div>
  );
}
