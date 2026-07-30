import { useCallback, useState } from "react";
import { LOCAL_LOGIN_NAME_KEY, useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";

export function LocalReconnectPanel({
  actionLabel = "Reconnect",
  onSuccess,
}: {
  actionLabel?: string;
  onSuccess?: () => void;
}) {
  const fetchMe = useAuthStore((state: AuthState) => state.fetchMe);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reconnect = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setError(null);
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
      onSuccess?.();
    } catch (reconnectError) {
      setError(reconnectError instanceof Error ? reconnectError.message : "Failed to reconnect");
    } finally {
      setPending(false);
    }
  }, [fetchMe, onSuccess, pending]);

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => void reconnect()} disabled={pending}>
        {pending ? "Reconnecting..." : actionLabel}
      </Button>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
