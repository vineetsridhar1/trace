import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CloudOff, RefreshCw } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useAuthReconnectStore } from "../../stores/auth-reconnect";
import { useConnectionStore, type ConnectionState } from "../../stores/connection";
import { useUIStore } from "../../stores/ui";
import { Button } from "../ui/button";

const OUTAGE_RETRY_INTERVAL_MS = 30_000;

export function AuthStatusBanner() {
  const authUnavailable = useAuthStore((state: AuthState) => state.authUnavailable);
  const reauthRequired = useAuthStore((state: AuthState) => state.reauthRequired);
  const fetchMe = useAuthStore((state: AuthState) => state.fetchMe);
  const connected = useConnectionStore((state: ConnectionState) => state.connected);
  const hasConnectionResult = useConnectionStore(
    (state: ConnectionState) => state.hasConnectionResult,
  );
  const reminderCollapsed = useAuthReconnectStore((state) => state.reminderCollapsed);
  const openDialog = useAuthReconnectStore((state) => state.openDialog);
  const collapseReminder = useAuthReconnectStore((state) => state.collapseReminder);
  const [retrying, setRetrying] = useState(false);
  const connectionInterrupted = authUnavailable || (hasConnectionResult && !connected);

  const retryConnection = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    await fetchMe();
    useUIStore.getState().triggerRefresh();
    setRetrying(false);
  }, [fetchMe, retrying]);

  useEffect(() => {
    if (!authUnavailable || reauthRequired) return;
    const intervalId = window.setInterval(() => {
      if (!document.hidden) void retryConnection();
    }, OUTAGE_RETRY_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [authUnavailable, reauthRequired, retryConnection]);

  if (reauthRequired && !reminderCollapsed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
        role="status"
      >
        <div className="flex min-w-0 items-center gap-2">
          <CloudOff size={15} className="shrink-0 text-amber-300" />
          <span>Trace is showing cached data. Reconnect to resume syncing.</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50"
            onClick={collapseReminder}
          >
            Later
          </Button>
          <Button
            size="sm"
            className="h-7 bg-amber-200 text-amber-950 hover:bg-amber-100"
            onClick={openDialog}
          >
            Reconnect
          </Button>
        </div>
      </motion.div>
    );
  }

  if (!reauthRequired && connectionInterrupted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-elevated/90 px-3 py-2 text-sm text-muted-foreground"
        role="status"
      >
        <div className="flex min-w-0 items-center gap-2">
          <RefreshCw size={15} className="shrink-0 animate-spin" />
          <span>Connection interrupted. Retrying…</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={retrying}
          onClick={() => void retryConnection()}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </motion.div>
    );
  }

  return null;
}
