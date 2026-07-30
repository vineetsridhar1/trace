import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { useAuthStore, useEntityField, useEntityStore } from "@trace/client-core";
import type { OrgSecret, RepoApplicationConfig } from "@trace/gql";
import { UPDATE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { ORG_SECRETS_QUERY } from "../agent-environment-queries";
import { ApplicationConfigDialog } from "./ApplicationConfigDialog";

const EMPTY_CONFIG: RepoApplicationConfig = { setupScripts: [], applications: [] };

export function RepoApplicationsSection({ repoId }: { repoId: string }) {
  const applicationConfig = useEntityField("repos", repoId, "applicationConfig") as
    | RepoApplicationConfig
    | undefined;
  const config = applicationConfig ?? EMPTY_CONFIG;
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretNames, setSecretNames] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !activeOrgId) return;
    let cancelled = false;
    void client
      .query(ORG_SECRETS_QUERY, { orgId: activeOrgId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result) => {
        if (cancelled || result.error) return;
        const secrets = (result.data?.orgSecrets as OrgSecret[] | undefined) ?? [];
        setSecretNames(secrets.map((secret) => secret.name));
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeOrgId]);

  const processCount = config.applications.reduce(
    (count, application) => count + application.processes.length,
    0,
  );
  const portCount = config.applications.reduce(
    (count, application) =>
      count +
      application.processes.reduce(
        (processTotal, process) => processTotal + process.ports.length,
        0,
      ),
    0,
  );

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
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Session automation
          </p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            {config.setupScripts.length} setup script{config.setupScripts.length === 1 ? "" : "s"} ·{" "}
            {config.applications.length} application{config.applications.length === 1 ? "" : "s"} ·{" "}
            {processCount} process{processCount === 1 ? "" : "es"} · {portCount} port
            {portCount === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Settings2 size={14} />
          Edit automation
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <ApplicationConfigDialog
        open={open}
        config={config}
        secretNames={secretNames}
        saving={saving}
        error={error}
        onOpenChange={setOpen}
        onSave={save}
      />
    </div>
  );
}
