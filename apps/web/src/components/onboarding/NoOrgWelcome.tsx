import { useEffect, useRef, useState } from "react";
import { Check, Copy, LogOut, RefreshCw } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";
import { CreateOrganizationDialog } from "../sidebar/CreateOrganizationDialog";
import { TraceLoader } from "../ui/trace-loader";

export function NoOrgWelcome() {
  const user = useAuthStore((s: AuthState) => s.user);
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const email = user?.email ?? "";
  const name = user?.name?.trim() ?? "";
  const accountLabel = name || email || "No account details available";

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCheckAgain() {
    setChecking(true);
    await fetchMe();
    setChecking(false);
  }

  async function handleCopy() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-deep px-4 py-8">
      <div className="w-full max-w-[520px] rounded-lg border border-border bg-surface-elevated p-6 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-deep">
              <img src="/trace-icon.svg" alt="" className="size-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">Trace</div>
              <div className="truncate text-xs text-muted-foreground">
                Start a workspace
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-surface-deep px-2.5 py-1 text-xs font-medium text-muted-foreground">
            No organization
          </span>
        </div>

        <h1 className="mt-7 text-[1.7rem] font-semibold leading-tight text-foreground">
          Create your organization
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          You are signed in, but this account is not part of a Trace organization yet.
          Create an organization to start using your workspace.
        </p>

        <div className="mt-6 rounded-lg border border-border bg-surface-deep p-3.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-medium uppercase text-muted-foreground">
              Your account
            </label>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!email}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="truncate text-sm font-medium text-foreground">{accountLabel}</div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CreateOrganizationDialog />
          <Button
            onClick={handleCheckAgain}
            disabled={checking}
            variant="outline"
            className="gap-2"
          >
            {checking ? <TraceLoader size={14} showLabel={false} /> : <RefreshCw size={14} />}
            {checking ? "Checking..." : "Check again"}
          </Button>
          <Button variant="ghost" onClick={() => void logout()} className="gap-2 text-destructive">
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
