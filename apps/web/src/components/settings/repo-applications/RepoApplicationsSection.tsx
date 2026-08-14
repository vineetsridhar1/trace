import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { useAuthStore, useEntityField, useEntityStore } from "@trace/client-core";
import type { OrgSecret, RepoApplicationConfig } from "@trace/gql";
import { UPDATE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { withRepoApplicationConfigDefaults } from "../../../lib/repo-application-config";
import { Button } from "../../ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../ui/accordion";
import { ORG_SECRETS_QUERY } from "../agent-environment-queries";
import { ApplicationConfigDialog } from "./ApplicationConfigDialog";

export function RepoApplicationsSection({ repoId }: { repoId: string }) {
  const applicationConfig = useEntityField("repos", repoId, "applicationConfig") as
    | RepoApplicationConfig
    | undefined;
  const repoName = useEntityField("repos", repoId, "name") ?? "Repository";
  const config = withRepoApplicationConfigDefaults(applicationConfig);
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretNames, setSecretNames] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !activeOrgId) return;
    let active = true;
    void client
      .query(ORG_SECRETS_QUERY, { orgId: activeOrgId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        const secrets = (result.data?.orgSecrets as OrgSecret[] | undefined) ?? [];
        setSecretNames(secrets.map((secret) => secret.name));
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, open]);

  const runScripts = config.runScripts;
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
    <div className="border-t border-border bg-background/30">
      <Accordion>
        <AccordionItem value="session-automation" className="border-0">
          <AccordionTrigger className="rounded-none px-4 py-3 hover:no-underline">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Session automation
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground/70">
                {setupScript ? "Setup configured" : "No setup"} · {runScripts.length} run
                {runScripts.length === 1 ? " script" : " scripts"}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="flex items-start justify-between gap-4 border-t border-border/70 pt-3">
              <p className="min-w-0 max-w-2xl text-xs leading-4 text-muted-foreground">
                The setup script runs once when a session workspace starts; terminals wait until it
                completes. Run scripts open as named terminals from the Run button.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setOpen(true)}
              >
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
                        key={script.id}
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
            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <ApplicationConfigDialog
        open={open}
        repoName={repoName}
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
