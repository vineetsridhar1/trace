import type {
  IntegrationConnection,
  IntegrationExecutionIdentity,
  SupportedAppIntegration,
} from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

export function AppIntegrationIdentityPicker({
  connections,
  identity,
  integration,
  sharedConnectionId,
  onConnectionChange,
  onIdentityChange,
}: {
  connections: IntegrationConnection[];
  identity: IntegrationExecutionIdentity;
  integration: SupportedAppIntegration;
  sharedConnectionId: string | null;
  onConnectionChange: (connectionId: string | null) => void;
  onIdentityChange: (identity: IntegrationExecutionIdentity) => void;
}) {
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const activeConnections = connections.filter(
    (connection) =>
      connection.providerConfigKey === integration.providerConfigKey &&
      connection.status === "active",
  );
  const eligibleConnections = activeConnections.filter(
    (connection) =>
      connection.kind === (identity === "service" ? "service" : "personal") &&
      (identity !== "shared" || connection.ownerUserId === currentUserId),
  );
  const hasOwnedPersonalConnection = activeConnections.some(
    (connection) => connection.kind === "personal" && connection.ownerUserId === currentUserId,
  );

  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">Whose account should it use?</p>
        <Select
          value={identity}
          onValueChange={(value) =>
            value && onIdentityChange(value as IntegrationExecutionIdentity)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Each viewer’s own account</SelectItem>
            <SelectItem
              value="shared"
              disabled={!hasOwnedPersonalConnection}
            >
              One shared personal account
            </SelectItem>
            <SelectItem
              value="service"
              disabled={!activeConnections.some((connection) => connection.kind === "service")}
            >
              Organization service account
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {identity !== "viewer" ? (
        <Select value={sharedConnectionId ?? ""} onValueChange={onConnectionChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a connected account" />
          </SelectTrigger>
          <SelectContent>
            {eligibleConnections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
