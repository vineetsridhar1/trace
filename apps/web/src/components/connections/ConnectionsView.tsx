import { Plug } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { ConnectionStatus } from "../ConnectionStatus";
import { useConnections } from "../../hooks/useConnections";
import { ConnectionsBridgeCard } from "./ConnectionsBridgeCard";

export function ConnectionsView() {
  const { connections, loading, refresh } = useConnections();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <Plug size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Connections</h2>
        <ConnectionStatus />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() => void refresh()}
        >
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading && connections.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No connected bridges.
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
    </div>
  );
}
