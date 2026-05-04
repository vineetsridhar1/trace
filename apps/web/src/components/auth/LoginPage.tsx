import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { LOCAL_LOGIN_NAME_KEY, useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { isLocalMode } from "../../lib/runtime-mode";

type GitHubDeviceLogin = {
  deviceAuthId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  interval: number;
};

type GitHubDevicePollResponse = {
  status?: "pending" | "success" | "expired" | "denied" | "error";
  interval?: number;
  error?: string;
};

export function LoginPage() {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const [deviceLogin, setDeviceLogin] = useState<GitHubDeviceLogin | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"idle" | "pending" | "success">("idle");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isLocalMode || !deviceLogin) return;

    const activeDeviceLogin = deviceLogin;
    let canceled = false;
    let pollTimeout: number | null = null;
    let intervalSeconds = activeDeviceLogin.interval;

    async function pollDeviceLogin() {
      try {
        const apiUrl = import.meta.env.VITE_API_URL ?? "";
        const response = await fetch(`${apiUrl}/auth/github/device/poll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ deviceAuthId: activeDeviceLogin.deviceAuthId }),
        });
        const payload = (await response.json().catch(() => ({}))) as GitHubDevicePollResponse;
        if (canceled) return;

        if (response.ok && payload.status === "success") {
          setDeviceStatus("success");
          await fetchMe();
          return;
        }

        if (response.ok && payload.status === "pending") {
          intervalSeconds =
            typeof payload.interval === "number" && payload.interval > 0
              ? payload.interval
              : intervalSeconds;
          pollTimeout = window.setTimeout(pollDeviceLogin, intervalSeconds * 1000);
          return;
        }

        throw new Error(payload.error ?? "GitHub login failed");
      } catch (loginError) {
        if (canceled) return;
        setDeviceLogin(null);
        setDeviceStatus("idle");
        setError(loginError instanceof Error ? loginError.message : "GitHub login failed");
      }
    }

    pollTimeout = window.setTimeout(pollDeviceLogin, intervalSeconds * 1000);

    return () => {
      canceled = true;
      if (pollTimeout !== null) {
        window.clearTimeout(pollTimeout);
      }
    };
  }, [deviceLogin, fetchMe]);

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

  async function startGithubDeviceLogin() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setCopied(false);

    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? "";
      const response = await fetch(`${apiUrl}/auth/github/device/start`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<
        GitHubDeviceLogin & { error: string }
      >;
      if (
        !response.ok ||
        !payload.deviceAuthId ||
        !payload.userCode ||
        !payload.verificationUri ||
        !payload.expiresAt ||
        typeof payload.interval !== "number"
      ) {
        throw new Error(payload.error ?? "Failed to start GitHub login");
      }

      const login = {
        deviceAuthId: payload.deviceAuthId,
        userCode: payload.userCode,
        verificationUri: payload.verificationUri,
        expiresAt: payload.expiresAt,
        interval: payload.interval,
      };
      setDeviceLogin(login);
      setDeviceStatus("pending");
      window.open(login.verificationUri, "_blank", "noopener,noreferrer");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Failed to start GitHub login");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUserCode() {
    if (!deviceLogin) return;
    await navigator.clipboard.writeText(deviceLogin.userCode);
    setCopied(true);
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
      <div className="flex w-full max-w-sm flex-col items-center gap-6 px-4">
        <h1 className="text-3xl font-bold text-foreground">Trace</h1>
        <p className="text-muted-foreground">
          AI-native project management and development platform
        </p>
        {deviceLogin ? (
          <div className="w-full rounded-xl border border-border bg-background p-5 shadow-sm">
            <div className="space-y-2 text-center">
              <p className="text-sm font-medium text-muted-foreground">Enter this GitHub code</p>
              <div className="rounded-lg border border-border bg-surface-deep px-4 py-3 font-mono text-2xl font-semibold tracking-widest text-foreground">
                {deviceLogin.userCode}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copyUserCode} className="gap-2">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                className="gap-2"
                onClick={() => window.open(deviceLogin.verificationUri, "_blank", "noreferrer")}
              >
                <ExternalLink size={16} />
                GitHub
              </Button>
            </div>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {deviceStatus === "success" ? "Signing in..." : "Waiting for GitHub approval..."}
            </p>

            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                setDeviceLogin(null);
                setDeviceStatus("idle");
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={startGithubDeviceLogin}
            size="lg"
            className="gap-2"
            disabled={submitting}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            {submitting ? "Starting..." : "Sign in with GitHub"}
          </Button>
        )}
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
