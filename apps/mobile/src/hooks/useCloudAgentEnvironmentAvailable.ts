import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { getClient } from "@/lib/urql";

const CLOUD_AGENT_ENVIRONMENT_QUERY = gql`
  query CloudAgentEnvironment($orgId: ID!) {
    agentEnvironments(orgId: $orgId) {
      id
      adapterType
      enabled
    }
  }
`;

type AgentEnvironmentSummary = {
  adapterType?: string | null;
  enabled?: boolean | null;
};

export function useCloudAgentEnvironmentAvailable(enabled = true): boolean {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!enabled || !activeOrgId) {
      setAvailable(false);
      return;
    }

    let cancelled = false;
    getClient()
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
