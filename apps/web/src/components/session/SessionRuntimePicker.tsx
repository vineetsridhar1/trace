import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cloud, Monitor } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import {
  AVAILABLE_SESSION_RUNTIMES_QUERY,
  MOVE_SESSION_TO_CLOUD_MUTATION,
  MOVE_SESSION_TO_RUNTIME_MUTATION,
} from "@trace/client-core";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { useCloudAgentEnvironmentAvailable } from "../../hooks/useCloudAgentEnvironmentAvailable";
import { DisabledTooltip } from "../ui/DisabledTooltip";
import { TraceLoader } from "../ui/trace-loader";
import { CLOUD_REPO_REMOTE_REQUIRED, repoRemoteKnownMissing } from "../../lib/repo-capabilities";

interface RuntimeInstance {
  id: string;
  label: string;
  hostingMode: string;
  supportedTools: string[];
  connected: boolean;
  sessionCount: number;
  registeredRepoIds: string[];
  access?: {
    allowed?: boolean;
    isOwner?: boolean;
    hostingMode?: string | null;
  } | null;
}

export function SessionRuntimePicker({
  sessionId,
  onClose,
  className,
  title = "Move to another instance",
  showCancel = true,
  includeCloud = true,
  excludeCurrent = true,
}: {
  sessionId: string;
  onClose: () => void;
  className?: string;
  title?: string;
  showCancel?: boolean;
  includeCloud?: boolean;
  excludeCurrent?: boolean;
}) {
  const [runtimes, setRuntimes] = useState<RuntimeInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as
    | { id: string; remoteUrl?: string | null }
    | null
    | undefined;
  const repoId = repo?.id ?? null;
  const cloudDisabledReason = repoRemoteKnownMissing(repo) ? CLOUD_REPO_REMOTE_REQUIRED : null;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | { runtimeInstanceId?: string | null }
    | null
    | undefined;
  const groupConnection = useEntityField("sessionGroups", sessionGroupId ?? "", "connection") as
    | { runtimeInstanceId?: string | null }
    | null
    | undefined;
  const currentRuntimeInstanceId =
    connection?.runtimeInstanceId ?? groupConnection?.runtimeInstanceId ?? null;
  const cloudEnvironmentAvailable = useCloudAgentEnvironmentAvailable();

  useEffect(() => {
    client
      .query(AVAILABLE_SESSION_RUNTIMES_QUERY, { sessionId })
      .toPromise()
      .then((result: { data?: Record<string, unknown> }) => {
        if (result.data?.availableSessionRuntimes) {
          setRuntimes(result.data.availableSessionRuntimes as RuntimeInstance[]);
        }
        setLoading(false);
      });
  }, [sessionId]);

  const handleMove = useCallback(
    async (runtimeInstanceId: string) => {
      setMoving(runtimeInstanceId);
      try {
        const result = await client
          .mutation(MOVE_SESSION_TO_RUNTIME_MUTATION, {
            sessionId,
            runtimeInstanceId,
          })
          .toPromise();
        if (result.error) {
          toast.error("Failed to move session", { description: result.error.message });
          return;
        }
        if (!result.data?.moveSessionToRuntime?.id) {
          toast.error("Failed to move session", { description: "No session returned" });
          return;
        }
        onClose();
      } catch (err) {
        toast.error("Failed to move session", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setMoving(null);
      }
    },
    [onClose, sessionId],
  );

  const handleMoveToCloud = useCallback(async () => {
    if (cloudDisabledReason) {
      toast.error("Cloud is unavailable for this repo", { description: cloudDisabledReason });
      return;
    }
    if (!cloudEnvironmentAvailable) {
      toast.error("Cloud is not configured for this organization");
      return;
    }
    setMoving("cloud");
    try {
      const result = await client
        .mutation(MOVE_SESSION_TO_CLOUD_MUTATION, {
          sessionId,
        })
        .toPromise();
      if (result.error) {
        toast.error("Failed to move session", { description: result.error.message });
        return;
      }
      if (!result.data?.moveSessionToCloud?.id) {
        toast.error("Failed to move session", { description: "No session returned" });
        return;
      }
      onClose();
    } catch (err) {
      toast.error("Failed to move session", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setMoving(null);
    }
  }, [cloudDisabledReason, cloudEnvironmentAvailable, onClose, sessionId]);

  const localRuntimes = runtimes.filter(
    (rt: RuntimeInstance) =>
      rt.hostingMode === "local" && (!excludeCurrent || rt.id !== currentRuntimeInstanceId),
  );

  return (
    <div className={cn("mt-2 rounded-lg border border-border bg-surface p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {showCancel && (
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <TraceLoader size={16} showLabel={false} />
        </div>
      ) : (
        <div className="space-y-1">
          {includeCloud && cloudEnvironmentAvailable ? (
            <DisabledTooltip message={cloudDisabledReason} fullWidth>
              <button
                onClick={handleMoveToCloud}
                disabled={moving !== null || !!cloudDisabledReason}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                <Cloud size={14} className="shrink-0 text-sky-400" />
                <div className="min-w-0 flex-1">
                  <span className="text-foreground">New cloud container</span>
                  <span className="ml-2 text-xs text-muted-foreground">pulls current branch</span>
                </div>
                {moving === "cloud" && (
                  <TraceLoader size={12} showLabel={false} />
                )}
              </button>
            </DisabledTooltip>
          ) : null}

          {localRuntimes.map((rt: RuntimeInstance) => {
            const lacksRepo =
              !!repoId && rt.hostingMode === "local" && !rt.registeredRepoIds.includes(repoId);
            const lacksAccess =
              rt.hostingMode === "local" && !(rt.access?.allowed || rt.access?.isOwner);
            const disabledReason = lacksRepo
              ? "This local runtime does not have this repo linked."
              : lacksAccess
                ? "You do not have access to this bridge."
              : !rt.connected
                ? "This local runtime is offline."
                : null;

            return (
              <DisabledTooltip key={rt.id} message={disabledReason} fullWidth>
                <button
                  onClick={() => handleMove(rt.id)}
                  disabled={!rt.connected || lacksRepo || lacksAccess || moving !== null}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-elevated transition-colors disabled:opacity-50"
                >
                  <Monitor size={14} className="shrink-0 text-green-400" />
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground">{rt.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {rt.sessionCount} session{rt.sessionCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {moving === rt.id && (
                    <TraceLoader size={12} showLabel={false} />
                  )}
                  {lacksRepo && (
                    <span className="flex items-center gap-1 text-xs text-amber-500">
                      <AlertTriangle size={10} />
                      repo not linked
                    </span>
                  )}
                  {!lacksRepo && lacksAccess && (
                    <span className="flex items-center gap-1 text-xs text-amber-500">
                      <AlertTriangle size={10} />
                      access required
                    </span>
                  )}
                  {!lacksRepo && !lacksAccess && !rt.connected && (
                    <span className="text-xs text-muted-foreground">offline</span>
                  )}
                </button>
              </DisabledTooltip>
            );
          })}

          {localRuntimes.length === 0 && (
            <p className="py-1 text-xs text-muted-foreground">No local bridges connected.</p>
          )}
        </div>
      )}
    </div>
  );
}
