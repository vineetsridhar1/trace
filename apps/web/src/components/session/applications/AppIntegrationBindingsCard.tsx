import { Database, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "../../ui/button";
import { AppIntegrationBindingForm } from "./AppIntegrationBindingForm";
import { useAppIntegrationBindings } from "./useAppIntegrationBindings";

export function AppIntegrationBindingsCard({ sessionGroupId }: { sessionGroupId: string }) {
  const state = useAppIntegrationBindings(sessionGroupId);
  const existingProviderConfigKeys = state.bindings.map((binding) => binding.providerConfigKey);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Data access
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Requests use only these identities, methods, and provider paths.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh data access"
          onClick={() => void state.refresh()}
        >
          <RefreshCw size={12} />
        </Button>
      </div>
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.bindings.map((binding) => (
        <div
          key={binding.id}
          className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Database size={14} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{binding.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {binding.provider} · {binding.executionIdentity} ·{" "}
                {binding.allowedMethods.join(", ")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${binding.label}`}
            disabled={state.pending}
            onClick={() => void state.remove(binding.id)}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      ))}
      <AppIntegrationBindingForm
        connections={state.connections}
        existingProviderConfigKeys={existingProviderConfigKeys}
        integrations={state.supportedIntegrations}
        pending={state.pending}
        onSave={state.save}
      />
      <p className="px-1 text-[11px] text-muted-foreground">
        Generated app code can reference the integration by name, such as <code>github</code> or{" "}
        <code>snowflake</code>. Trace applies these permissions automatically.
      </p>
    </section>
  );
}
