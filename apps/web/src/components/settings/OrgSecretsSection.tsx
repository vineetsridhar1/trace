import { useCallback, useEffect, useState } from "react";
import type { OrgSecret } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { toast } from "sonner";
import { AgentEnvironmentSecretsPanel } from "./AgentEnvironmentSecretsPanel";
import { ORG_SECRETS_QUERY } from "./agent-environment-queries";
import { client } from "../../lib/urql";

export function OrgSecretsSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [loading, setLoading] = useState(true);
  const [orgSecrets, setOrgSecrets] = useState<OrgSecret[]>([]);

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
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Launcher Secrets</h2>
        <p className="text-sm text-muted-foreground">
          Manage encrypted organization secrets used by provisioned runtime launchers.
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          Loading launcher secrets...
        </div>
      ) : activeOrgId ? (
        <AgentEnvironmentSecretsPanel
          organizationId={activeOrgId}
          orgSecrets={orgSecrets}
          onSaved={() => void fetchSecrets()}
        />
      ) : null}
    </div>
  );
}
