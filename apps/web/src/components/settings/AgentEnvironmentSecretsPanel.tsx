import { useState } from "react";
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { OrgSecret } from "@trace/gql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { client } from "../../lib/urql";
import { DELETE_ORG_SECRET_MUTATION, SET_ORG_SECRET_MUTATION } from "./agent-environment-queries";

type Props = {
  organizationId: string;
  orgSecrets: OrgSecret[];
  onSaved: () => void;
};

export function AgentEnvironmentSecretsPanel({ organizationId, orgSecrets, onSaved }: Props) {
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
    <section className="mb-4 rounded-lg border border-border bg-surface-deep p-4">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Launcher Secrets</h3>
      </div>
      <form onSubmit={saveSecret} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input
          placeholder="Secret value"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" disabled={pending !== null || !name.trim() || !value}>
          {pending === "save" ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Save size={14} className="mr-1.5" />
          )}
          Save
        </Button>
      </form>
      {orgSecrets.length ? (
        <div className="mt-3 divide-y divide-border rounded-md border border-border">
          {orgSecrets.map((secret) => (
            <div key={secret.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{secret.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{secret.id}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pending !== null}
                onClick={() => void deleteSecret(secret)}
              >
                {pending === secret.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
