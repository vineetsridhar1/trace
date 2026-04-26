import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LOCAL_LOGIN_NAME_KEY, useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { isLocalMode } from "../../lib/runtime-mode";

export function LoginPage() {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  useEffect(() => {
    if (isLocalMode) return;

    function handleAuthSuccess() {
      void fetchMe();
    }

    function onMessage(event: MessageEvent) {
      if (event.data?.type === "auth:success") {
        handleAuthSuccess();
      }
    }
    window.addEventListener("message", onMessage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("trace_auth");
      bc.onmessage = (event: MessageEvent) => {
        if (event.data?.type === "auth:success") {
          handleAuthSuccess();
        }
      };
    } catch {
      // BroadcastChannel unavailable.
    }

    return () => {
      window.removeEventListener("message", onMessage);
      bc?.close();
    };
  }, [fetchMe]);

  const loginWithLocalName = useCallback(async (
    rawName: string,
    options?: { allowEmpty?: boolean; silent?: boolean },
  ) => {
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
      const payload = await response.json().catch(
        () => ({} as { error?: string; user?: { name?: string } }),
      );
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to sign in");
      }
      const persistedName =
        typeof payload.user?.name === "string" ? payload.user.name.trim() : trimmedName;
      if (persistedName.length >= 2) {
        localStorage.setItem(LOCAL_LOGIN_NAME_KEY, persistedName);
      }
      await fetchMe();
      return true;
    } catch (loginError) {
      if (!options?.silent) {
        setError(loginError instanceof Error ? loginError.message : "Failed to sign in");
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [fetchMe, submitting]);

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

  function openGithubLogin() {
    const w = 500;
    const h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    const apiUrl = import.meta.env.VITE_API_URL ?? "";
    window.open(
      `${apiUrl}/auth/github?origin=${encodeURIComponent(window.location.origin)}`,
      "github-login",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
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
    <div className="flex h-dvh items-center justify-center bg-surface-deep">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-foreground">Trace</h1>
        <p className="text-muted-foreground">
          AI-native project management and development platform
        </p>
        <Button onClick={openGithubLogin} size="lg" className="gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          Sign in with GitHub
        </Button>
      </div>
    </div>
  );
}
