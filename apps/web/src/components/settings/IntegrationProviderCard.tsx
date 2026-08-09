import type { IntegrationConnection, SupportedAppIntegration } from "@trace/gql";
import { Database, Github, Plug, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { SettingsStatusPill } from "./SettingsStatusPill";

export function IntegrationProviderCard({
  connections,
  integration,
  pending,
  onConnect,
  onDisconnect,
}: {
  connections: IntegrationConnection[];
  integration: SupportedAppIntegration;
  pending: boolean;
  onConnect: (integration: SupportedAppIntegration) => void;
  onDisconnect: (connection: IntegrationConnection) => void;
}) {
  const Icon = integration.id === "github" ? Github : Database;

  return (
    <div className="rounded-lg border border-border bg-background/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background/60">
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{integration.name}</p>
              {connections.length > 0 ? (
                <SettingsStatusPill tone="success" label="Connected" />
              ) : (
                <SettingsStatusPill tone="muted" label="Available" />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{integration.description}</p>
          </div>
        </div>
        <Button size="sm" disabled={pending} onClick={() => onConnect(integration)}>
          <Plug size={14} />
          Connect
        </Button>
      </div>

      {connections.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {connections.map((connection) => (
            <div key={connection.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                <span className="font-medium text-foreground">{connection.displayName}</span>
                {` · ${connection.kind} · ${connection.status}`}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Disconnect ${connection.displayName}`}
                onClick={() => onDisconnect(connection)}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
