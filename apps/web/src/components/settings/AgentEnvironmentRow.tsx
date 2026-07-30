import { Cloud, PlugZap, Trash2 } from "lucide-react";
import type { AgentEnvironment } from "@trace/gql";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";
import { environmentConfig, formatAdapterType } from "./agent-environment-utils";
import { SettingsStatusPill } from "./SettingsStatusPill";

type TestResult = {
  ok: boolean;
  message?: string | null;
};

type Props = {
  environment: AgentEnvironment;
  pendingActionId: string | null;
  testResult?: TestResult;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
};

export function AgentEnvironmentRow({
  environment,
  pendingActionId,
  testResult,
  onEdit,
  onTest,
  onDelete,
}: Props) {
  const config = environmentConfig(environment);
  const pending = pendingActionId === environment.id;
  const testStatusClass = testResult
    ? testResult.ok
      ? "text-green-600 dark:text-green-400"
      : "text-destructive"
    : "text-muted-foreground";
  const testStatusMessage = testResult
    ? (testResult.message ?? (testResult.ok ? "Connection test passed" : "Connection test failed"))
    : "Last test: not run";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
          <Cloud size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[13px] font-semibold text-foreground">
              {environment.name}
            </h3>
            <SettingsStatusPill
              tone={environment.enabled ? "success" : "muted"}
              label={environment.enabled ? "Enabled" : "Disabled"}
            />
            {environment.isDefault ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Default
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>{formatAdapterType(environment.adapterType)}</span>
            {environment.adapterType === "local" && config.runtimeInstanceId ? (
              <span>{config.runtimeInstanceId}</span>
            ) : null}
            {environment.adapterType === "provisioned" && config.statusUrl ? (
              <span className="truncate">{config.statusUrl}</span>
            ) : null}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onTest}
          className="shrink-0"
        >
          {pending ? (
            <TraceLoader size={14} showLabel={false} className="mr-1.5" />
          ) : (
            <PlugZap size={14} className="mr-1.5" />
          )}
          Test
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {environment.adapterType === "provisioned" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${environment.name}`}
          >
            <Trash2 size={14} />
          </Button>
        ) : null}
      </div>
      <div
        className={cn(
          "flex items-center gap-2 border-t border-border bg-background/30 px-4 py-2.5 text-xs",
          testStatusClass,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {testStatusMessage}
      </div>
      {environment.adapterType === "provisioned" ? (
        <div className="grid gap-6 border-t border-border px-4 py-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Launcher endpoints
            </p>
            <div className="space-y-1.5 text-xs">
              {[
                ["Start", config.startUrl],
                ["Stop", config.stopUrl],
                ["Status", config.statusUrl],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
                  <code className="min-w-0 truncate rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {value ?? "Not configured"}
                  </code>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Runtime policy
            </p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>
                Startup timeout{" "}
                <span className="text-foreground">
                  {config.startupTimeoutSeconds ?? 180} seconds
                </span>
              </p>
              <p>
                Deprovision{" "}
                <span className="text-foreground">
                  {config.deprovisionPolicy === "manual" ? "Manually" : "On session end"}
                </span>
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
