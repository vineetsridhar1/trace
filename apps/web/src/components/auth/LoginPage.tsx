import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LOCAL_LOGIN_NAME_KEY, useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { isLocalMode } from "../../lib/runtime-mode";
import { GitHubDeviceLoginPanel } from "./GitHubDeviceLoginPanel";

export function LoginPage() {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  const loginWithLocalName = useCallback(
    async (rawName: string, options?: { allowEmpty?: boolean; silent?: boolean }) => {
      const trimmedName = rawName.trim();
      if ((!options?.allowEmpty && trimmedName.length < 2) || submitting) return false;
      setSubmitting(true);
      if (!options?.silent) {
        setError(null);
      }
      try {
        const apiUrl = import.meta.env.VITE_API_URL ?? "";
        const response = await fetch(`${apiUrl}/auth/local/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(trimmedName ? { name: trimmedName } : {}),
        });
        const payload = await response
          .json()
          .catch(() => ({}) as { error?: string; user?: { name?: string } });
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to sign in");
        }
        const persistedName =
          typeof payload.user?.name === "string" ? payload.user.name.trim() : trimmedName;
        if (persistedName.length >= 2) {
          localStorage.setItem(LOCAL_LOGIN_NAME_KEY, persistedName);
        }
        return await fetchMe();
      } catch (loginError) {
        if (!options?.silent) {
          setError(loginError instanceof Error ? loginError.message : "Failed to sign in");
        }
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [fetchMe, submitting],
  );

  useEffect(() => {
    if (!isLocalMode || autoLoginAttempted) return;
    setAutoLoginAttempted(true);

    const rememberedName = localStorage.getItem(LOCAL_LOGIN_NAME_KEY)?.trim() ?? "";
    if (rememberedName.length >= 2) {
      setName(rememberedName);
      void loginWithLocalName(rememberedName);
      return;
    }

    void loginWithLocalName("", { allowEmpty: true, silent: true });
  }, [autoLoginAttempted, loginWithLocalName]);

  async function handleLocalLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loginWithLocalName(name);
  }

  if (isLocalMode) {
    return (
      <div className="flex h-dvh items-center justify-center bg-surface-deep px-4">
        <form
          onSubmit={handleLocalLogin}
          className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm"
        >
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Trace</h1>
            <p className="text-sm text-muted-foreground">
              Start local Trace with a name. No GitHub login or Redis required.
            </p>
          </div>

          <div className="mt-6 space-y-2">
            <label htmlFor="local-name" className="text-sm font-medium text-foreground">
              Your name
            </label>
            <Input
              id="local-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Developer"
              autoFocus
              autoComplete="name"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <Button
            type="submit"
            size="lg"
            className="mt-6 w-full"
            disabled={submitting || name.trim().length < 2}
          >
            {submitting ? "Signing in..." : "Enter Trace"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 [background:var(--trace-window-bg)] backdrop-blur-2xl">
      <div className="app-region-drag fixed inset-x-0 top-0 h-14" />
      <div className="flex w-full max-w-sm flex-col items-center gap-6 px-4">
        <div className="space-y-3 text-center">
          <img src="/trace-icon.svg" alt="" className="mx-auto h-16 w-16" />
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Trace</h1>
            <p className="text-muted-foreground">
              AI-native project management and development platform
            </p>
          </div>
        </div>
        <div className="app-region-no-drag w-full">
          <GitHubDeviceLoginPanel />
        </div>
      </div>
    </div>
  );
}
