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
      count + application.processes.reduce((processTotal, process) => processTotal + process.ports.length, 0),
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
      const message = saveError instanceof Error ? saveError.message : "Failed to save applications";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Applications</p>
          <p className="truncate text-xs text-muted-foreground">
            {config.setupScripts.length} setup, {config.applications.length} apps, {processCount} processes, {portCount} ports
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Settings2 size={14} />
          Configure
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
