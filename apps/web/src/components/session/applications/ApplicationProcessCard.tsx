import { Play, Square } from "lucide-react";
import type {
  RepoProcessDefinition,
  SessionApplicationLogEntry,
  SessionApplicationProcess,
  SessionEndpoint,
} from "@trace/gql";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { EndpointCard } from "./EndpointCard";
import { ProcessLogs } from "./ProcessLogs";
import { displayApplicationStatus } from "./session-applications-operations";

export function ApplicationProcessCard({
  config,
  endpoints,
  logEntries,
  isPending,
  processPending,
  process,
  refreshingLogs,
  onCopyEndpoint,
  onOpenEndpoint,
  onOpenTraffic,
  onRefreshLogs,
  onToggleEndpoint,
  onToggleProcess,
}: {
  config: RepoProcessDefinition;
  endpoints: SessionEndpoint[];
  logEntries: SessionApplicationLogEntry[];
  isPending: (key: string) => boolean;
  processPending: boolean;
  process?: SessionApplicationProcess;
  refreshingLogs: boolean;
  onCopyEndpoint: (endpoint: SessionEndpoint) => void;
  onOpenEndpoint: (endpoint: SessionEndpoint) => void;
  onOpenTraffic: (endpointId: string) => void;
  onRefreshLogs: () => void;
  onToggleEndpoint: (endpoint: SessionEndpoint) => void;
  onToggleProcess: (active: boolean) => void;
}) {
  const running = process?.status === "running";
  const active = running || process?.status === "starting" || process?.status === "stopping";

  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-background/35 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{config.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                running
                  ? "bg-emerald-500"
                  : process?.status === "starting" || process?.status === "stopping"
                    ? "bg-amber-500"
                    : "bg-muted-foreground/40",
              )}
              aria-hidden="true"
            />
            <span className="text-[11px] text-muted-foreground">
              {displayApplicationStatus(process?.status ?? "stopped")}
            </span>
          </div>
        </div>
        <Button
          variant={active ? "ghost" : "outline"}
          size="icon-sm"
          title={active ? `Stop ${config.name}` : `Start ${config.name}`}
          aria-label={active ? `Stop ${config.name}` : `Start ${config.name}`}
          disabled={processPending}
          onClick={() => onToggleProcess(active)}
        >
          {active ? <Square size={14} /> : <Play size={14} />}
        </Button>
      </div>
      {process ? (
        <ProcessLogs
          entries={logEntries}
          process={process}
          refreshing={refreshingLogs}
          onRefresh={onRefreshLogs}
        />
      ) : null}
      {endpoints.map((endpoint) => (
        <EndpointCard
          key={endpoint.id}
          endpoint={endpoint}
          isPending={isPending}
          processRunning={running}
          onCopy={() => onCopyEndpoint(endpoint)}
          onOpen={() => onOpenEndpoint(endpoint)}
          onOpenTraffic={() => onOpenTraffic(endpoint.id)}
          onToggle={() => onToggleEndpoint(endpoint)}
        />
      ))}
    </div>
  );
}
