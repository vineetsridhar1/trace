import { useCallback, useEffect, useState } from "react";
import type { OrgSecret } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { toast } from "sonner";
import { AgentEnvironmentSecretsPanel } from "./AgentEnvironmentSecretsPanel";
import { ORG_SECRETS_QUERY } from "./agent-environment-queries";
import { client } from "../../lib/urql";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import { Button } from "../ui/button";
import { Terminal } from "lucide-react";

export function OrgSecretsSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [loading, setLoading] = useState(true);
  const [orgSecrets, setOrgSecrets] = useState<OrgSecret[]>([]);
  const [showImport, setShowImport] = useState(false);

  const fetchSecrets = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      setOrgSecrets([]);
      return;
    }
    setLoading(true);
    try {
      const result = await client
        .query(ORG_SECRETS_QUERY, { orgId: activeOrgId }, { requestPolicy: "network-only" })
        .toPromise();
      if (result.error) throw result.error;
      setOrgSecrets((result.data?.orgSecrets as OrgSecret[] | undefined) ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load launcher secrets");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void fetchSecrets();
  }, [fetchSecrets]);

  return (
    <div>
      <SettingsSectionHeader
        title="Secrets"
        description="Encrypted workspace-wide values for cloud launchers, session runtimes, and shared server actions. Values are write-only and can never be read back."
        action={
          <Button variant="outline" size="sm" onClick={() => setShowImport((open) => !open)}>
            <Terminal size={14} />
            {showImport ? "Hide import" : "Import from .env"}
          </Button>
        }
      />

      {loading ? (
        <div className="rounded-lg border border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          Loading launcher secrets...
        </div>
      ) : activeOrgId ? (
        <AgentEnvironmentSecretsPanel
          organizationId={activeOrgId}
          orgSecrets={orgSecrets}
          onSaved={() => void fetchSecrets()}
          showImport={showImport}
        />
      ) : null}
    </div>
  );
}
