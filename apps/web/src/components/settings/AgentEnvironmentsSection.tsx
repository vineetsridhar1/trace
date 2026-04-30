import { Bot, Plus, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { AgentEnvironmentForm } from "./AgentEnvironmentForm";
import { AgentEnvironmentRow } from "./AgentEnvironmentRow";
import { useAgentEnvironmentsSettings } from "./useAgentEnvironmentsSettings";

export function AgentEnvironmentsSection() {
  const settings = useAgentEnvironmentsSettings();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Provisioned Environments</h2>
          <p className="text-sm text-muted-foreground">
            Manage launcher-backed runtimes for this organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void settings.fetchSettings()}>
            <RefreshCw size={14} className="mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={settings.createEnvironment} disabled={!settings.activeOrgId}>
            <Plus size={14} className="mr-1.5" />
            New provisioned
          </Button>
        </div>
      </div>

      {settings.loading ? (
        <div className="rounded-lg border border-border bg-surface-deep p-4 text-sm text-muted-foreground">
          Loading agent environments...
        </div>
      ) : settings.environmentIds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-deep p-8 text-center">
          <Bot className="mx-auto mb-3 text-muted-foreground" size={28} />
          <p className="text-sm text-muted-foreground">No provisioned environments configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
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
                onSetDefault={() =>
                  void settings.updateEnvironment(environment, { isDefault: true })
                }
                onToggleEnabled={() =>
                  void settings.updateEnvironment(environment, {
                    enabled: !environment.enabled,
                    isDefault: environment.enabled ? false : environment.isDefault,
                  })
                }
                onTest={() => void settings.testEnvironment(environment)}
                onDelete={() => void settings.deleteEnvironment(environment)}
              />
            );
          })}
        </div>
      )}

      {settings.activeOrgId ? (
        <AgentEnvironmentForm
          open={settings.formOpen}
          organizationId={settings.activeOrgId}
          environment={settings.editingEnvironment}
          localBridges={settings.localBridges}
          orgSecrets={settings.orgSecrets}
          onOpenChange={settings.setFormOpen}
          onSaved={() => undefined}
        />
      ) : null}
    </div>
  );
}
