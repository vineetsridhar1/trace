import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AgentEnvironment, OrgSecret, Repo } from "@trace/gql";
import { useAuthStore, useEntityIds, useEntityStore } from "@trace/client-core";
import type { EntityTableMap } from "@trace/client-core";
import { client } from "../../lib/urql";
import {
  AGENT_ENVIRONMENTS_SETTINGS_QUERY,
  DELETE_AGENT_ENVIRONMENT_MUTATION,
  TEST_AGENT_ENVIRONMENT_MUTATION,
  UPDATE_AGENT_ENVIRONMENT_MUTATION,
} from "./agent-environment-queries";
import type { LocalBridgeSummary } from "./agent-environment-utils";

type TestResult = {
  ok: boolean;
  message?: string | null;
};

export function useAgentEnvironmentsSettings() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const environmentsById = useEntityStore((s) => s.agentEnvironments);
  const [loading, setLoading] = useState(true);
  const [localBridges, setLocalBridges] = useState<LocalBridgeSummary[]>([]);
  const [orgSecrets, setOrgSecrets] = useState<OrgSecret[]>([]);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const environmentIds = useEntityIds(
    "agentEnvironments",
    (environment: EntityTableMap["agentEnvironments"]) => environment.orgId === activeOrgId,
    compareEnvironments,
  );
  const editingEnvironment = editingEnvironmentId
    ? (environmentsById[editingEnvironmentId] ?? null)
    : null;

  const fetchSettings = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const result = await client
        .query(
          AGENT_ENVIRONMENTS_SETTINGS_QUERY,
          { orgId: activeOrgId, organizationId: activeOrgId },
          { requestPolicy: "network-only" },
        )
        .toPromise();

      if (result.error) throw result.error;
      upsertMany(
        "agentEnvironments",
        (result.data?.agentEnvironments as Array<AgentEnvironment & { id: string }> | undefined) ??
          [],
      );
      upsertMany("repos", (result.data?.repos as Array<Repo & { id: string }> | undefined) ?? []);
      setOrgSecrets((result.data?.orgSecrets as OrgSecret[] | undefined) ?? []);
      setLocalBridges(parseLocalBridges(result.data?.myConnections));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load agent environments");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  function createEnvironment() {
    setEditingEnvironmentId(null);
    setFormOpen(true);
  }

  function editEnvironment(id: string) {
    setEditingEnvironmentId(id);
    setFormOpen(true);
  }

  async function updateEnvironment(
    environment: AgentEnvironment,
    input: Partial<AgentEnvironment>,
  ) {
    setPendingActionId(environment.id);
    try {
      const result = await client
        .mutation(UPDATE_AGENT_ENVIRONMENT_MUTATION, {
          input: { id: environment.id, enabled: input.enabled, isDefault: input.isDefault },
        })
        .toPromise();
      if (result.error) throw result.error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update environment");
    } finally {
      setPendingActionId(null);
    }
  }

  async function deleteEnvironment(environment: AgentEnvironment) {
    if (!window.confirm(`Delete ${environment.name}?`)) return;
    setPendingActionId(environment.id);
    try {
      const result = await client
        .mutation(DELETE_AGENT_ENVIRONMENT_MUTATION, { id: environment.id })
        .toPromise();
      if (result.error) throw result.error;
      toast.success("Agent environment deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete environment");
    } finally {
      setPendingActionId(null);
    }
  }

  async function testEnvironment(environment: AgentEnvironment) {
    setPendingActionId(environment.id);
    try {
      const result = await client
        .mutation(TEST_AGENT_ENVIRONMENT_MUTATION, { id: environment.id })
        .toPromise();
      if (result.error) throw result.error;
      const testResult = result.data?.testAgentEnvironment as TestResult | undefined;
      if (!testResult) return;
      setTestResults((current) => ({ ...current, [environment.id]: testResult }));
      if (testResult.ok) toast.success(testResult.message ?? "Connection test passed");
      else toast.error(testResult.message ?? "Connection test failed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      setTestResults((current) => ({ ...current, [environment.id]: { ok: false, message } }));
      toast.error(message);
    } finally {
      setPendingActionId(null);
    }
  }

  return {
    activeOrgId,
    editingEnvironment,
    environmentIds,
    environmentsById,
    fetchSettings,
    formOpen,
    loading,
    localBridges,
    orgSecrets,
    pendingActionId,
    setFormOpen,
    testResults,
    createEnvironment,
    deleteEnvironment,
    editEnvironment,
    testEnvironment,
    updateEnvironment,
  };
}

function compareEnvironments(a: unknown, b: unknown): number {
  const envA = a as EntityTableMap["agentEnvironments"];
  const envB = b as EntityTableMap["agentEnvironments"];
  if (envA.isDefault !== envB.isDefault) return envA.isDefault ? -1 : 1;
  return envA.name.localeCompare(envB.name);
}

function parseLocalBridges(value: unknown): LocalBridgeSummary[] {
  if (!Array.isArray(value)) return [];
  const bridges: LocalBridgeSummary[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      bridge?: {
        instanceId?: unknown;
        label?: unknown;
        hostingMode?: unknown;
        connected?: unknown;
      };
      repos?: Array<{ repo?: { id?: unknown; name?: unknown } | null }>;
    };
    const bridge = record.bridge;
    if (
      !bridge ||
      bridge.hostingMode !== "local" ||
      typeof bridge.instanceId !== "string" ||
      typeof bridge.label !== "string"
    ) {
      continue;
    }
    bridges.push({
      id: bridge.instanceId,
      label: bridge.label,
      connected: bridge.connected === true,
      registeredRepos: parseRegisteredRepos(record.repos),
    });
  }
  return bridges;
}

function parseRegisteredRepos(
  value: Array<{ repo?: { id?: unknown; name?: unknown } | null }> | undefined,
): Array<{ id: string; name: string }> {
  return (
    value
      ?.map((entry) => entry.repo)
      .filter(
        (repo): repo is { id: string; name: string } =>
          typeof repo?.id === "string" && typeof repo.name === "string",
      ) ?? []
  );
}
