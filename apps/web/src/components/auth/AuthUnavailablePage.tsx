import { useState } from "react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";

export function AuthUnavailablePage() {
  const fetchMe = useAuthStore((state: AuthState) => state.fetchMe);
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    await fetchMe();
    setRetrying(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 [background:var(--trace-window-bg)]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-xl">
        <img src="/trace-icon.svg" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">
          Trace is temporarily unavailable
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your login has not been cleared. Check your connection and try again.
        </p>
        <Button className="mt-5 w-full" onClick={() => void retry()} disabled={retrying}>
          {retrying ? "Trying again..." : "Try again"}
        </Button>
      </div>
    </div>
  );
}
