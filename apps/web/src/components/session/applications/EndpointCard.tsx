import { Activity, Copy, ExternalLink, Globe, Power, Square } from "lucide-react";
import type { SessionEndpoint } from "@trace/gql";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { displayApplicationStatus } from "./session-applications-operations";

export function EndpointCard({
  endpoint,
  isAppGroup,
  isPending,
  processRunning,
  onCopy,
  onOpen,
  onOpenTraffic,
  onPublish,
  onToggle,
}: {
  endpoint: SessionEndpoint;
  isAppGroup: boolean;
  isPending: (key: string) => boolean;
  processRunning: boolean;
  onCopy: () => void;
  onOpen: () => void;
  onOpenTraffic: () => void;
  onPublish: () => void;
  onToggle: () => void;
}) {
  const enabled = endpoint.status === "enabled";
  const canOpen = enabled && endpoint.url.length > 0;

  return (
    <div className="space-y-2 border-t border-border/70 pt-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            {endpoint.label}
            <span className="ml-1 font-normal text-muted-foreground">:{endpoint.targetPort}</span>
          </p>
          {canOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-left text-[11px] text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              title={endpoint.url}
            >
              {endpoint.url}
            </button>
          ) : (
            <p className="text-[11px] text-muted-foreground">Forwarding disabled</p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
            enabled
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {displayApplicationStatus(endpoint.status)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant={enabled ? "ghost" : "outline"}
          size="icon-sm"
          title={enabled ? `Disable ${endpoint.label}` : `Enable ${endpoint.label}`}
          aria-label={enabled ? `Disable ${endpoint.label}` : `Enable ${endpoint.label}`}
          disabled={isPending(endpoint.id) || (!enabled && !processRunning)}
          onClick={onToggle}
        >
          {enabled ? <Square size={14} /> : <Power size={14} />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={`Open ${endpoint.label}`}
          aria-label={`Open ${endpoint.label}`}
          disabled={!canOpen}
          onClick={onOpen}
        >
          <ExternalLink size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={`Copy ${endpoint.label} URL`}
          aria-label={`Copy ${endpoint.label} URL`}
          disabled={!endpoint.url}
          onClick={onCopy}
        >
          <Copy size={14} />
        </Button>
        {isAppGroup && enabled && endpoint.accessMode === "private" ? (
          <Button
            variant="outline"
            size="sm"
            title={`Publish ${endpoint.label}`}
            disabled={isPending(`publish:${endpoint.id}`)}
            onClick={onPublish}
          >
            <Globe size={13} />
            Publish
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          title={`Show ${endpoint.label} traffic`}
          aria-label={`Show ${endpoint.label} traffic`}
          onClick={onOpenTraffic}
        >
          <Activity size={14} />
        </Button>
      </div>
    </div>
  );
}
