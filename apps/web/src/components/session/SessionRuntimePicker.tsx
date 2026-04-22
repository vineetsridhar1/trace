import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cloud, Monitor, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import {
  AVAILABLE_SESSION_RUNTIMES_QUERY,
  MOVE_SESSION_TO_RUNTIME_MUTATION,
  MOVE_SESSION_TO_CLOUD_MUTATION,
} from "@trace/client-core";
import { navigateToSession } from "../../stores/ui";
import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { isLocalMode } from "../../lib/runtime-mode";

interface RuntimeInstance {
  id: string;
  label: string;
  hostingMode: string;
  supportedTools: string[];
  connected: boolean;
  sessionCount: number;
  registeredRepoIds: string[];
}

export function SessionRuntimePicker({
  sessionId,
  onClose,
  className,
}: {
  sessionId: string;
  onClose: () => void;
  className?: string;
}) {
  const [runtimes, setRuntimes] = useState<RuntimeInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as string | undefined;
  const channel = useEntityField("sessions", sessionId, "channel") as { id: string } | null | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as { id: string } | null | undefined;
  const repoId = repo?.id ?? null;
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
          .mutation(MOVE_SESSION_TO_RUNTIME_MUTATION, { sessionId, runtimeInstanceId })
          .toPromise();
        if (result.error) {
          toast.error("Failed to move session", { description: result.error.message });
          return;
        }
        const newSessionId = result.data?.moveSessionToRuntime?.id;
        if (newSessionId && sessionGroupId) {
          navigateToSession(channel?.id ?? null, sessionGroupId, newSessionId);
        } else {
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
    [channel?.id, onClose, sessionGroupId, sessionId],
  );

  const handleMoveToCloud = useCallback(async () => {
    if (isLocalMode) return;
    setMoving("cloud");
    try {
      const result = await client
        .mutation(MOVE_SESSION_TO_CLOUD_MUTATION, { sessionId })
        .toPromise();
      if (result.error) {
        toast.error("Failed to move session to cloud", { description: result.error.message });
        return;
      }
      const newSessionId = result.data?.moveSessionToCloud?.id;
      if (newSessionId && sessionGroupId) {
        navigateToSession(channel?.id ?? null, sessionGroupId, newSessionId);
      } else {
        toast.error("Failed to move session to cloud", { description: "No session returned" });
        return;
      }
      onClose();
    } catch (err) {
      toast.error("Failed to move session to cloud", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setMoving(null);
    }
  }, [channel?.id, onClose, sessionGroupId, sessionId]);

  const localRuntimes = runtimes.filter((rt: RuntimeInstance) => rt.id !== currentRuntimeInstanceId);
  const canMoveToCloud = !isLocalMode && hosting !== "cloud";

  return (
    <div className={cn("mt-2 rounded-lg border border-border bg-surface p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Move to another instance</h3>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1">
          {canMoveToCloud && (
            <button
              onClick={handleMoveToCloud}
              disabled={moving !== null}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              <Cloud size={14} className="shrink-0 text-blue-400" />
              <div className="min-w-0 flex-1">
                <span className="text-foreground">Cloud</span>
              </div>
              {moving === "cloud" && (
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              )}
            </button>
          )}

          {/* Local bridges */}
          {localRuntimes.map((rt: RuntimeInstance) => {
            const lacksRepo =
              !!repoId &&
              rt.hostingMode === "local" &&
              !rt.registeredRepoIds.includes(repoId);

            return (
              <button
                key={rt.id}
                onClick={() => handleMove(rt.id)}
                disabled={!rt.connected || lacksRepo || moving !== null}
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
                  <Loader2 size={12} className="animate-spin text-muted-foreground" />
                )}
                {lacksRepo && (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <AlertTriangle size={10} />
                    repo not linked
                  </span>
                )}
                {!lacksRepo && !rt.connected && (
                  <span className="text-xs text-muted-foreground">offline</span>
                )}
              </button>
            );
          })}

          {localRuntimes.length === 0 && !canMoveToCloud && (
            <p className="py-1 text-xs text-muted-foreground">
              No other runtimes available.
            </p>
          )}
          {localRuntimes.length === 0 && canMoveToCloud && (
            <p className="py-1 text-xs text-muted-foreground">
              No other local bridges connected.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
