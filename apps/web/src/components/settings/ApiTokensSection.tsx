import { useState, useEffect, useCallback } from "react";
import { Key, Trash2, Check, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

const API_TOKENS_QUERY = gql`
  query MyApiTokens {
    myApiTokens {
      provider
      isSet
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

interface TokenStatus {
  provider: string;
  isSet: boolean;
  updatedAt: string | null;
}

const PROVIDER_META: Record<string, { label: string; placeholder: string; description: string }> = {
  anthropic: {
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-...",
    description: "Used for Claude Code sessions",
  },
  openai: {
    label: "OpenAI (Codex)",
    placeholder: "sk-...",
    description: "Used for Codex sessions",
  },
  github: {
    label: "GitHub",
    placeholder: "ghp_...",
    description: "Used for repository access in cloud sessions",
  },
  ssh_key: {
    label: "SSH Key",
    placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----",
    description: "Used for SSH-based repository access in cloud sessions",
  },
};

export function ApiTokensSection() {
  const user = useAuthStore((s) => s.user);
  const [tokens, setTokens] = useState<TokenStatus[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!user) return;
    const result = await client.query(API_TOKENS_QUERY, {}).toPromise();
    if (result.data?.myApiTokens) {
      setTokens(result.data.myApiTokens as TokenStatus[]);
    }
  }, [user]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  async function handleSave(provider: string) {
    if (!inputValue.trim()) return;
    setSaving(true);
    await client
      .mutation(SET_API_TOKEN, { input: { provider, token: provider === "ssh_key" ? inputValue : inputValue.trim() } })
      .toPromise();
    setSaving(false);
    setEditing(null);
    setInputValue("");
    setShowInput(false);
    // Refetch to get the updated state from the server
    fetchTokens();
  }

  async function handleDelete(provider: string) {
    await client.mutation(DELETE_API_TOKEN, { provider }).toPromise();
    // Refetch to get the updated state from the server
    fetchTokens();
  }

  return (
    <section className="mx-auto max-w-2xl mt-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">API Keys</h2>
        <p className="text-sm text-muted-foreground">
          Tokens are encrypted and injected into cloud sessions at startup.
        </p>
      </div>

      <div className="space-y-3">
        {tokens.map((token) => {
          const meta = PROVIDER_META[token.provider];
          if (!meta) return null;
          const isEditing = editing === token.provider;

          return (
            <div
              key={token.provider}
              className="rounded-lg border border-border bg-surface-deep p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key size={16} className="text-muted-foreground" />
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditing(token.provider);
                          setInputValue("");
                          setShowInput(false);
                        }}
                      >
                        <Key size={14} />
                      </Button>
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(token.provider);
                        setInputValue("");
                        setShowInput(false);
                      }}
                    >
                      Add key
                    </Button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="mt-3 space-y-2">
                  {token.provider === "ssh_key" ? (
                    <Textarea
                      placeholder={meta.placeholder}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditing(null);
                          setInputValue("");
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
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(token.provider);
                          if (e.key === "Escape") {
                            setEditing(null);
                            setInputValue("");
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(token.provider)}
                      disabled={!inputValue.trim() || saving}
                    >
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(null);
                        setInputValue("");
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
    </section>
  );
}
