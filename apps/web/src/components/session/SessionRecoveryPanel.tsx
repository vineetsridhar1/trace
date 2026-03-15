import { useCallback, useState } from "react";
import { RefreshCw, ArrowRightLeft, WifiOff } from "lucide-react";
import { client } from "../../lib/urql";
import {
  RETRY_SESSION_CONNECTION_MUTATION,
} from "../../lib/mutations";
import { SessionRuntimePicker } from "./SessionRuntimePicker";

export function SessionRecoveryPanel({
  sessionId,
  connection,
}: {
  sessionId: string;
  connection: Record<string, unknown> | null | undefined;
}) {
  const [retrying, setRetrying] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const lastError = (connection?.lastError as string) ?? undefined;
  const retryCount = (connection?.retryCount as number) ?? 0;
  const canRetry = ((connection?.canRetry as boolean | undefined) ?? true) && retryCount < 3;
  const canMove = (connection?.canMove as boolean | undefined) ?? true;

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await client.mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId }).toPromise();
    } finally {
      setRetrying(false);
    }
  }, [sessionId]);

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
        <WifiOff size={16} className="shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Connection lost</p>
          {lastError && (
            <p className="text-xs text-muted-foreground truncate">{lastError}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={retrying ? "animate-spin" : ""} />
              Retry
            </button>
          )}
          {canMove && (
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-surface-elevated transition-colors"
            >
              <ArrowRightLeft size={12} />
              Move
            </button>
          )}
        </div>
      </div>

      {showPicker && (
        <SessionRuntimePicker
          sessionId={sessionId}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
