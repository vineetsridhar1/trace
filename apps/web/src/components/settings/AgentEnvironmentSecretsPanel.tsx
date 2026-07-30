import { useState } from "react";
import { Check, KeyRound, Save, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { OrgSecret } from "@trace/gql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TraceLoader } from "../ui/trace-loader";
import { client } from "../../lib/urql";
import { DELETE_ORG_SECRET_MUTATION, SET_ORG_SECRET_MUTATION } from "./agent-environment-queries";
import { ImportEnvSecretsForm } from "./ImportEnvSecretsForm";
import { SettingsStatusPill } from "./SettingsStatusPill";

type Props = {
  organizationId: string;
  orgSecrets: OrgSecret[];
  onSaved: () => void;
  showImport?: boolean;
};

export function AgentEnvironmentSecretsPanel({
  organizationId,
  orgSecrets,
  onSaved,
  showImport = false,
}: Props) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function saveSecret(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !value) return;
    setPending("save");
    try {
      const result = await client
        .mutation(SET_ORG_SECRET_MUTATION, {
          input: { orgId: organizationId, name: trimmedName, value },
        })
        .toPromise();
      if (result.error) throw result.error;
      setName("");
      setValue("");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save secret");
    } finally {
      setPending(null);
    }
  }

  async function deleteSecret(secret: OrgSecret) {
    if (!window.confirm(`Delete ${secret.name}?`)) return;
    setPending(secret.id);
    try {
      const result = await client
        .mutation(DELETE_ORG_SECRET_MUTATION, { orgId: organizationId, id: secret.id })
        .toPromise();
      if (result.error) throw result.error;
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete secret");
    } finally {
      setPending(null);
    }
  }

  return (
    <section>
      <form onSubmit={saveSecret} className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={15} className="text-muted-foreground" />
          <h3 className="text-[13px] font-medium text-foreground">Add a secret</h3>
        </div>
        <div className="grid gap-2 md:grid-cols-[256px_1fr_auto]">
          <Input
            aria-label="Secret name"
            placeholder="NAME_IN_SCREAMING_SNAKE"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 bg-background font-mono text-xs"
          />
          <Input
            aria-label="Secret value"
            placeholder="Value"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-9 bg-background text-[13px]"
          />
          <Button type="submit" disabled={pending !== null || !name.trim() || !value}>
            {pending === "save" ? (
              <TraceLoader size={14} showLabel={false} className="mr-1.5" />
            ) : (
              <Save size={14} className="mr-1.5" />
            )}
            Save secret
          </Button>
        </div>
      </form>
      {orgSecrets.length ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[220px_minmax(0,1fr)_130px_40px] items-center gap-4 border-b border-border bg-background/40 px-4 py-2.5">
            {["Name", "Used for", "Updated", ""].map((label) => (
              <span
                key={label}
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
          {orgSecrets.map((secret) => (
            <div
              key={secret.id}
              className="grid grid-cols-[220px_minmax(0,1fr)_130px_40px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-background/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Shield size={13} className="shrink-0 text-muted-foreground" />
                <code className="truncate font-mono text-xs text-foreground">{secret.name}</code>
              </div>
              <p className="truncate text-[13px] text-muted-foreground">
                {secret.name === "GITHUB_TOKEN"
                  ? "Shared GitHub access for files and diffs"
                  : "Available to launchers and session runtimes"}
              </p>
              <span className="text-[13px] text-muted-foreground">
                {new Date(secret.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pending !== null}
                onClick={() => void deleteSecret(secret)}
              >
                {pending === secret.id ? (
                  <TraceLoader size={14} showLabel={false} />
                ) : (
                  <Trash2 size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {showImport ? (
        <ImportEnvSecretsForm organizationId={organizationId} onImported={onSaved} />
      ) : null}
      {orgSecrets.some((secret) => secret.name === "GITHUB_TOKEN") ? (
        <div className="mt-5 flex items-start justify-between gap-4 rounded-lg border border-border bg-card/50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
            <p className="text-xs leading-5 text-muted-foreground">
              <code className="font-mono text-foreground">GITHUB_TOKEN</code> is set, so members can
              browse GitHub files and diffs without personal tokens.
            </p>
          </div>
          <SettingsStatusPill tone="success" label="Recommended setup complete" />
        </div>
      ) : null}
    </section>
  );
}
