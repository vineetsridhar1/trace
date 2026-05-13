import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { ConnectionStatus } from "../ConnectionStatus";
import { useConnections } from "../../hooks/useConnections";
import { ConnectionsBridgeCard } from "../connections/ConnectionsBridgeCard";

export function ConnectionsSection() {
  const { connections, loading, refresh } = useConnections();

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Connections</h2>
            <ConnectionStatus />
          </div>
          <p className="text-sm text-muted-foreground">Local bridges connected to Trace.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {loading && connections.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">No connected bridges.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((connection) => (
            <ConnectionsBridgeCard
              key={connection.bridge.id}
              connection={connection}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
