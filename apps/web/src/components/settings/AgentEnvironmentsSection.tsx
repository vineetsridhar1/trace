import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { AgentEnvironment, Repo, SessionRuntimeInstance } from "@trace/gql";
import {
  AVAILABLE_RUNTIMES_QUERY,
  useAuthStore,
  useEntityIds,
  useEntityStore,
} from "@trace/client-core";
import type { EntityTableMap } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { AgentEnvironmentForm } from "./AgentEnvironmentForm";
import { AgentEnvironmentRow } from "./AgentEnvironmentRow";
import {
  AGENT_ENVIRONMENTS_SETTINGS_QUERY,
  DELETE_AGENT_ENVIRONMENT_MUTATION,
  TEST_AGENT_ENVIRONMENT_MUTATION,
  UPDATE_AGENT_ENVIRONMENT_MUTATION,
} from "./agent-environment-queries";

type TestResult = {
  ok: boolean;
  message?: string | null;
};

export function AgentEnvironmentsSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsert = useEntityStore((s) => s.upsert);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const remove = useEntityStore((s) => s.remove);
  const [loading, setLoading] = useState(true);
  const [localRuntimes, setLocalRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const environmentIds = useEntityIds(
    "agentEnvironments",
    (environment: EntityTableMap["agentEnvironments"]) => environment.orgId === activeOrgId,
    (a, b) => {
      const envA = a as EntityTableMap["agentEnvironments"];
      const envB = b as EntityTableMap["agentEnvironments"];
      if (envA.isDefault !== envB.isDefault) return envA.isDefault ? -1 : 1;
      return envA.name.localeCompare(envB.name);
    },
  );
  const repoIds = useEntityIds("repos");
  const environmentsById = useEntityStore((s) => s.agentEnvironments);
  const reposById = useEntityStore((s) => s.repos);

  const repoNamesById = useMemo(() => {
    const names = new Map<string, string>();
    for (const id of repoIds) {
      const repo = reposById[id];
      if (repo) names.set(id, repo.name);
    }
    return names;
  }, [repoIds, reposById]);

  const editingEnvironment = editingEnvironmentId
    ? (environmentsById[editingEnvironmentId] ?? null)
    : null;

  const fetchSettings = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const [settingsResult, runtimesResult] = await Promise.all([
        client
          .query(
            AGENT_ENVIRONMENTS_SETTINGS_QUERY,
            { orgId: activeOrgId, organizationId: activeOrgId },
            { requestPolicy: "network-only" },
          )
          .toPromise(),
        client
          .query(
            AVAILABLE_RUNTIMES_QUERY,
            { tool: "claude_code", sessionGroupId: null },
            { requestPolicy: "network-only" },
          )
          .toPromise(),
      ]);

      if (settingsResult.error) throw settingsResult.error;
      if (runtimesResult.error) throw runtimesResult.error;

      const environments =
        (settingsResult.data?.agentEnvironments as
          | Array<AgentEnvironment & { id: string }>
          | undefined) ?? [];
      const repos = (settingsResult.data?.repos as Array<Repo & { id: string }> | undefined) ?? [];
      upsertMany("agentEnvironments", environments);
      upsertMany("repos", repos);
      setLocalRuntimes(
        (
          (runtimesResult.data?.availableRuntimes as SessionRuntimeInstance[] | undefined) ?? []
        ).filter((runtime) => runtime.hostingMode === "local"),
      );
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
          input: {
            id: environment.id,
            enabled: input.enabled,
            isDefault: input.isDefault,
          },
        })
        .toPromise();
      if (result.error) throw result.error;
      const updated = result.data?.updateAgentEnvironment as AgentEnvironment | undefined;
      if (updated) upsert("agentEnvironments", updated.id, updated);
      await fetchSettings();
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
      remove("agentEnvironments", environment.id);
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
      if (testResult) {
        setTestResults((current) => ({ ...current, [environment.id]: testResult }));
        if (testResult.ok) toast.success(testResult.message ?? "Connection test passed");
        else toast.error(testResult.message ?? "Connection test failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      setTestResults((current) => ({
        ...current,
        [environment.id]: { ok: false, message },
      }));
      toast.error(message);
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Agent Environments</h2>
          <p className="text-sm text-muted-foreground">
            Manage local and provisioned runtimes for this organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchSettings()}>
            <RefreshCw size={14} className="mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={createEnvironment} disabled={!activeOrgId}>
            <Plus size={14} className="mr-1.5" />
            New
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          Loading agent environments...
        </div>
      ) : environmentIds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-deep p-8 text-center">
          <Bot className="mx-auto mb-3 text-muted-foreground" size={28} />
          <p className="text-sm text-muted-foreground">No agent environments configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {environmentIds.map((id) => {
            const environment = environmentsById[id];
            if (!environment) return null;
            return (
              <AgentEnvironmentRow
                key={id}
                environment={environment}
                pendingActionId={pendingActionId}
                testResult={testResults[id]}
                onEdit={() => editEnvironment(id)}
                onSetDefault={() => void updateEnvironment(environment, { isDefault: true })}
                onToggleEnabled={() =>
                  void updateEnvironment(environment, {
                    enabled: !environment.enabled,
                    isDefault: environment.enabled ? false : environment.isDefault,
                  })
                }
                onTest={() => void testEnvironment(environment)}
                onDelete={() => void deleteEnvironment(environment)}
              />
            );
          })}
        </div>
      )}

      {activeOrgId ? (
        <AgentEnvironmentForm
          open={formOpen}
          organizationId={activeOrgId}
          environment={editingEnvironment}
          localRuntimes={localRuntimes}
          repoNamesById={repoNamesById}
          onOpenChange={setFormOpen}
          onSaved={(environment) => {
            upsert("agentEnvironments", environment.id, environment);
            void fetchSettings();
          }}
        />
      ) : null}
    </div>
  );
}
