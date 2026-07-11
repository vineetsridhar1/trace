import { RotateCw, Settings } from "lucide-react";
import { Button } from "../../ui/button";
import { ApplicationProcessCard } from "./ApplicationProcessCard";
import { SetupScriptCard } from "./SetupScriptCard";
import { useSessionApplicationsPanel } from "./useSessionApplicationsPanel";

export function SessionApplicationsPanel({
  sessionGroupId,
  onOpenTraffic,
}: {
  sessionGroupId: string;
  onOpenTraffic: (endpointId: string) => void;
}) {
  const state = useSessionApplicationsPanel(sessionGroupId);
  const config = state.config;

  if (!config || (config.setupScripts.length === 0 && config.applications.length === 0)) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-surface-deep">
        <PanelHeader onRefresh={state.refresh} />
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
          <div className="max-w-64 text-center">
            <Settings size={22} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No applications configured</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Configure repository setup scripts, processes, and ports in settings.
            </p>
            <Button type="button" size="sm" className="mt-4" onClick={state.openRepositorySettings}>
              <Settings size={14} />
              Configure in Settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-deep">
      <PanelHeader onRefresh={state.refresh} />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-3">
        {state.error ? (
          <p
            aria-live="polite"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {state.error}
          </p>
        ) : null}
        {config.setupScripts.length > 0 ? (
          <section className="space-y-1.5">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Setup
            </p>
            {config.setupScripts.map((script) => (
              <SetupScriptCard
                key={script.id}
                script={script}
                latestRun={state.latestSetupRunByScript.get(script.id)}
                pending={state.isPending(script.id)}
                onRun={() => state.runSetup(script.id)}
              />
            ))}
          </section>
        ) : null}
        <div className="space-y-4">
          {config.applications.map((application) => (
            <section key={application.id} className="space-y-2">
              <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {application.name}
              </p>
              <div className="space-y-2">
                {application.processes.map((processConfig) => {
                  const key = `${application.id}:${processConfig.id}`;
                  const process = state.processesByKey.get(key);
                  return (
                    <ApplicationProcessCard
                      key={processConfig.id}
                      config={processConfig}
                      endpoints={state.endpointsByProcess.get(key) ?? []}
                      groupKind={state.groupKind}
                      logEntries={process ? (state.processLogsById[process.id] ?? []) : []}
                      isPending={state.isPending}
                      process={process}
                      processPending={state.isPending(key)}
                      refreshingLogs={process ? Boolean(state.refreshingLogIds[process.id]) : false}
                      onCopyEndpoint={(endpoint) => void state.copyEndpoint(endpoint)}
                      onOpenEndpoint={(endpoint) => void state.openEndpoint(endpoint)}
                      onOpenTraffic={onOpenTraffic}
                      onPublish={state.publish}
                      onRefreshLogs={() => process && void state.refreshProcessLogs(process.id)}
                      onToggleEndpoint={state.toggleEndpoint}
                      onToggleProcess={(active) =>
                        state.toggleProcess(application.id, processConfig.id, active)
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
      <p className="text-sm font-semibold text-foreground">Applications</p>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Refresh applications"
        aria-label="Refresh applications"
        onClick={onRefresh}
      >
        <RotateCw size={14} />
      </Button>
    </div>
  );
}
