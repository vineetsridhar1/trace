import { Cloud, Plus, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { AgentEnvironmentForm } from "./AgentEnvironmentForm";
import { AgentEnvironmentLocalBridgeList } from "./AgentEnvironmentLocalBridgeList";
import { AgentEnvironmentRow } from "./AgentEnvironmentRow";
import { useAgentEnvironmentsSettings } from "./useAgentEnvironmentsSettings";

export function AgentEnvironmentsSection() {
  const settings = useAgentEnvironmentsSettings();
  const hasEnabledProvisionedEnvironment = settings.environmentIds.some(
    (id) => settings.environmentsById[id]?.enabled,
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Agent Environments</h2>
          <p className="text-sm text-muted-foreground">
            Manage where agent sessions can run for this organization.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void settings.fetchSettings()}>
          <RefreshCw size={14} className="mr-1.5" />
          Refresh
        </Button>
      </div>

      {settings.loading ? (
        <div className="rounded-lg border border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          Loading agent environments...
        </div>
      ) : (
        <>
          <AgentEnvironmentLocalBridgeList localBridges={settings.localBridges} />

          <section className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Cloud</h3>
                <p className="text-xs text-muted-foreground">
                  Cloud environments use your launcher to provision managed runtimes on demand.
                </p>
              </div>
              <Button
                size="sm"
                onClick={settings.createEnvironment}
                disabled={!settings.activeOrgId || hasEnabledProvisionedEnvironment}
                title={
                  hasEnabledProvisionedEnvironment
                    ? "Only one cloud environment can be enabled per organization"
                    : undefined
                }
              >
                <Plus size={14} className="mr-1.5" />
                New cloud
              </Button>
            </div>

            {settings.environmentIds.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-surface-deep p-8 text-center">
                <Cloud className="mx-auto mb-3 text-muted-foreground" size={28} />
                <p className="text-sm text-muted-foreground">No cloud environment configured.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {settings.environmentIds.map((id) => {
                  const environment = settings.environmentsById[id];
                  if (!environment) return null;
                  return (
                    <AgentEnvironmentRow
                      key={id}
                      environment={environment}
                      pendingActionId={settings.pendingActionId}
                      testResult={settings.testResults[id]}
                      onEdit={() => settings.editEnvironment(id)}
                      onTest={() => void settings.testEnvironment(environment)}
                      onDelete={() => void settings.deleteEnvironment(environment)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {settings.activeOrgId ? (
        <AgentEnvironmentForm
          open={settings.formOpen}
          organizationId={settings.activeOrgId}
          environment={settings.editingEnvironment}
          localBridges={settings.localBridges}
          orgSecrets={settings.orgSecrets}
          onOpenChange={settings.setFormOpen}
          onSaved={() => void settings.fetchSettings()}
        />
      ) : null}
    </div>
  );
}
