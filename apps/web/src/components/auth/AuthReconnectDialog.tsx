import { useCallback, useState } from "react";
import { LOCAL_LOGIN_NAME_KEY, useAuthStore, type AuthState } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { isLocalMode } from "../../lib/runtime-mode";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { GitHubDeviceLoginPanel } from "./GitHubDeviceLoginPanel";

export function AuthReconnectDialog() {
  const open = useAuthStore((state: AuthState) => state.reauthRequired);
  const fetchMe = useAuthStore((state: AuthState) => state.fetchMe);
  const logout = useAuthStore((state: AuthState) => state.logout);
  const [localPending, setLocalPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleReconnect = useCallback(() => {
    useUIStore.getState().triggerRefresh();
  }, []);

  const reconnectLocal = useCallback(async () => {
    if (localPending) return;
    setLocalPending(true);
    setLocalError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? "";
      const rememberedName = localStorage.getItem(LOCAL_LOGIN_NAME_KEY)?.trim() ?? "";
      const response = await fetch(`${apiUrl}/auth/local/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(rememberedName ? { name: rememberedName } : {}),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to reconnect");
      }
      if (!(await fetchMe())) {
        throw new Error("Trace could not restore your local session.");
      }
      handleReconnect();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Failed to reconnect");
    } finally {
      setLocalPending(false);
    }
  }, [fetchMe, handleReconnect, localPending]);

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconnect to Trace</DialogTitle>
          <DialogDescription>
            Your sign-in expired, but your current workspace is still open. Confirm your identity to
            continue where you left off.
          </DialogDescription>
        </DialogHeader>

        {isLocalMode ? (
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => void reconnectLocal()}
              disabled={localPending}
            >
              {localPending ? "Reconnecting..." : "Reconnect"}
            </Button>
            {localError ? (
              <p className="text-center text-sm text-destructive">{localError}</p>
            ) : null}
          </div>
        ) : (
          <GitHubDeviceLoginPanel actionLabel="Reconnect with GitHub" onSuccess={handleReconnect} />
        )}

        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          Sign out instead
        </Button>
      </DialogContent>
    </Dialog>
  );
}
