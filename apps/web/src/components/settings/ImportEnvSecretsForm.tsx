import { useMemo, useState } from "react";
import { FileInput, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { TraceLoader } from "../ui/trace-loader";
import { client } from "../../lib/urql";
import { SET_ORG_SECRET_MUTATION } from "./agent-environment-queries";
import { parseEnvSecrets } from "./parse-env-secrets";

type Props = {
  organizationId: string;
  onImported: () => void;
};

export function ImportEnvSecretsForm({ organizationId, onImported }: Props) {
  const [envText, setEnvText] = useState("");
  const [importing, setImporting] = useState(false);
  const parsed = useMemo(() => parseEnvSecrets(envText), [envText]);
  const canImport = parsed.entries.length > 0 && !importing;

  async function importSecrets(event: React.FormEvent) {
    event.preventDefault();
    if (!canImport) return;

    setImporting(true);
    try {
      for (const entry of parsed.entries) {
        const result = await client
          .mutation(SET_ORG_SECRET_MUTATION, {
            input: { orgId: organizationId, name: entry.name, value: entry.value },
          })
          .toPromise();
        if (result.error) throw result.error;
      }
      toast.success(
        `Imported ${parsed.entries.length} secret${parsed.entries.length === 1 ? "" : "s"}`,
      );
      setEnvText("");
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import secrets");
    } finally {
      setImporting(false);
    }
  }

  return (
    <form onSubmit={importSecrets} className="mt-4 border-t border-border pt-4">
      <div className="mb-2 flex items-center gap-2">
        <FileInput size={16} className="text-muted-foreground" />
        <h4 className="text-sm font-medium text-foreground">Import .env</h4>
      </div>
      <Textarea
        className="min-h-32 font-mono text-xs"
        placeholder={"DATABASE_URL=postgres://...\nGITHUB_TOKEN=ghp_..."}
        value={envText}
        onChange={(event) => setEnvText(event.target.value)}
      />
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {parsed.entries.length} key{parsed.entries.length === 1 ? "" : "s"} ready
          {parsed.invalidLines.length
            ? `, ${parsed.invalidLines.length} line${
                parsed.invalidLines.length === 1 ? "" : "s"
              } ignored`
            : ""}
        </p>
        <Button type="submit" disabled={!canImport}>
          {importing ? (
            <TraceLoader size={14} showLabel={false} className="mr-1.5" />
          ) : (
            <Save size={14} className="mr-1.5" />
          )}
          Save parsed keys
        </Button>
      </div>
      {parsed.entries.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {parsed.entries.slice(0, 12).map((entry) => (
            <span
              key={entry.name}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {entry.name}
            </span>
          ))}
          {parsed.entries.length > 12 ? (
            <span className="px-1.5 py-0.5 text-[11px] text-muted-foreground">
              +{parsed.entries.length - 12} more
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
