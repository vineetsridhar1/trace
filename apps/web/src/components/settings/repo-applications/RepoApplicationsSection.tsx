import { useState } from "react";
import { Settings2 } from "lucide-react";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { RepoApplicationConfig } from "@trace/gql";
import { UPDATE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { ApplicationConfigDialog } from "./ApplicationConfigDialog";

const EMPTY_CONFIG: RepoApplicationConfig = { setupScripts: [], applications: [] };

export function RepoApplicationsSection({ repoId }: { repoId: string }) {
  const applicationConfig = useEntityField("repos", repoId, "applicationConfig") as
    | RepoApplicationConfig
    | undefined;
  const repoName = useEntityField("repos", repoId, "name") ?? "Repository";
  const config = applicationConfig ?? EMPTY_CONFIG;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScripts = config.applications.flatMap((application) =>
    application.processes.map((process) => ({ ...process, applicationId: application.id })),
  );
  const setupScript = config.setupScripts[0]?.command;

  const save = async (nextConfig: RepoApplicationConfig) => {
    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(UPDATE_REPO_MUTATION, {
          id: repoId,
          input: { applicationConfig: nextConfig },
        })
        .toPromise();
      if (result.error) throw result.error;
      useEntityStore.getState().patch("repos", repoId, { applicationConfig: nextConfig });
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to save applications";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border bg-background/30 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Session automation
          </p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            The setup script runs once when a session workspace starts; terminals wait until it
            completes. Run scripts open as named terminals from the Run button.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Settings2 size={14} />
          Edit automation
        </Button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Setup script</p>
          <pre className="min-h-10 overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs leading-5 text-foreground">
            {setupScript || "No setup script configured."}
          </pre>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Run scripts · {runScripts.length} of 10
          </p>
          {runScripts.length ? (
            <div className="space-y-1.5">
              {runScripts.map((script) => (
                <div
                  key={`${script.applicationId}:${script.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5"
                >
                  <span className="w-24 shrink-0 truncate text-xs font-medium text-foreground">
                    {script.name}
                  </span>
                  <code className="truncate font-mono text-[11px] text-muted-foreground">
                    {script.command}
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              No run scripts configured.
            </p>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <ApplicationConfigDialog
        open={open}
        repoName={repoName}
        config={config}
        saving={saving}
        error={error}
        onOpenChange={setOpen}
        onSave={save}
      />
    </div>
  );
}
