import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore, type AuthState } from "@trace/client-core";

export type GitHubDeviceLogin = {
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

export function useGitHubDeviceLogin(onSuccess?: () => void) {
  const fetchMe = useAuthStore((state: AuthState) => state.fetchMe);
  const onSuccessRef = useRef(onSuccess);
  const [deviceLogin, setDeviceLogin] = useState<GitHubDeviceLogin | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"idle" | "pending" | "success">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!deviceLogin) return;

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
          const restored = await fetchMe();
          if (!restored) {
            throw new Error("GitHub approved the login, but Trace could not restore your session.");
          }
          onSuccessRef.current?.();
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

  const start = useCallback(async () => {
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

      setDeviceLogin({
        deviceAuthId: payload.deviceAuthId,
        userCode: payload.userCode,
        verificationUri: payload.verificationUri,
        expiresAt: payload.expiresAt,
        interval: payload.interval,
      });
      setDeviceStatus("pending");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Failed to start GitHub login");
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  const copyCode = useCallback(async () => {
    if (!deviceLogin) return;
    await navigator.clipboard.writeText(deviceLogin.userCode);
    setCopied(true);
  }, [deviceLogin]);

  const cancel = useCallback(() => {
    setDeviceLogin(null);
    setDeviceStatus("idle");
  }, []);

  return {
    cancel,
    copied,
    copyCode,
    deviceLogin,
    deviceStatus,
    error,
    start,
    submitting,
  };
}
