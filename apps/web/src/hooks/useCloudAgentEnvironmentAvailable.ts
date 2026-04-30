import { useEffect, useState } from "react";
import { CLOUD_AGENT_ENVIRONMENT_QUERY, useAuthStore } from "@trace/client-core";
import { client } from "../lib/urql";

type AgentEnvironmentSummary = {
  adapterType?: string | null;
  enabled?: boolean | null;
};

export function useCloudAgentEnvironmentAvailable(enabled = true): boolean {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!enabled || !activeOrgId) {
      setAvailable(false);
      return;
    }

    let cancelled = false;
    client
      .query(
        CLOUD_AGENT_ENVIRONMENT_QUERY,
        { orgId: activeOrgId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const environments =
          (result.data?.agentEnvironments as AgentEnvironmentSummary[] | undefined) ?? [];
        setAvailable(
          environments.some(
            (environment) =>
              environment.adapterType === "provisioned" && environment.enabled === true,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, enabled]);

  return available;
}
