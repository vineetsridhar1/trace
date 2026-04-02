import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ArrowRightLeft, WifiOff, Loader2 } from "lucide-react";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import {
  RETRY_SESSION_CONNECTION_MUTATION,
} from "../../lib/mutations";
import { SessionRuntimePicker } from "./SessionRuntimePicker";

/** Max number of automatic retry attempts before giving up */
const MAX_AUTO_RETRIES = 5;

/** Base delay in ms for exponential backoff (doubles each attempt: 2s, 4s, 8s, 16s, 32s) */
const BASE_DELAY_MS = 2_000;

export function SessionRecoveryPanel({
  sessionId,
  connection,
}: {
  sessionId: string;
  connection: Record<string, unknown> | null | undefined;
}) {
  const [retrying, setRetrying] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const autoRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastError = (connection?.lastError as string) ?? undefined;
  const canRetry = (connection?.canRetry as boolean | undefined) ?? true;
  const canMove = (connection?.canMove as boolean | undefined) ?? true;

  const doRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await client.mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId }).toPromise();
    } finally {
      setRetrying(false);
    }
  }, [sessionId]);

  // Auto-retry with exponential backoff
  useEffect(() => {
    if (!canRetry) return;
    if (autoRetryCount >= MAX_AUTO_RETRIES) return;

    let cancelled = false;
    const delay = BASE_DELAY_MS * Math.pow(2, autoRetryCount);
    autoRetryTimer.current = setTimeout(async () => {
      autoRetryTimer.current = null;
      try {
        await doRetry();
      } catch {
        // doRetry handles its own errors; swallow unexpected failures
      }
      // Schedule next attempt only if still mounted and not cancelled
      if (!cancelled) {
        setAutoRetryCount((c: number) => c + 1);
      }
    }, delay);

    return () => {
      cancelled = true;
      if (autoRetryTimer.current) {
        clearTimeout(autoRetryTimer.current);
        autoRetryTimer.current = null;
      }
    };
  }, [canRetry, autoRetryCount, doRetry]);

  // Reset auto-retry count when sessionId changes (navigated to different session)
  useEffect(() => {
    setAutoRetryCount(0);
  }, [sessionId]);

  const handleManualRetry = useCallback(async () => {
    // Cancel any pending auto-retry
    if (autoRetryTimer.current) {
      clearTimeout(autoRetryTimer.current);
      autoRetryTimer.current = null;
    }
    // Reset auto-retry counter so it starts fresh after manual retry
    setAutoRetryCount(0);
    await doRetry();
  }, [doRetry]);

  const autoRetrying = canRetry && autoRetryCount < MAX_AUTO_RETRIES;
  const autoRetriesExhausted = canRetry && autoRetryCount >= MAX_AUTO_RETRIES;

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <div className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2.5",
        autoRetrying
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-destructive/30 bg-destructive/5",
      )}>
        {autoRetrying ? (
          <Loader2 size={16} className="shrink-0 text-yellow-500 animate-spin" />
        ) : (
          <WifiOff size={16} className="shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {autoRetrying ? "Reconnecting…" : "Connection lost"}
          </p>
          {lastError && !autoRetrying && (
            <p className="text-xs text-muted-foreground truncate">{lastError}</p>
          )}
          {autoRetrying && (
            <p className="text-xs text-muted-foreground">
              Attempt {autoRetryCount + 1} of {MAX_AUTO_RETRIES}
            </p>
          )}
          {autoRetriesExhausted && (
            <p className="text-xs text-muted-foreground">
              Auto-retry stopped — use Retry to try manually
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canRetry && (
            <button
              onClick={handleManualRetry}
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
