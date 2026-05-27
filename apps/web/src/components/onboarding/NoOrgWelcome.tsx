import { useEffect, useRef, useState } from "react";
import { Check, Copy, LogOut, Plus, RefreshCw } from "lucide-react";
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
    <div className="flex min-h-dvh items-center justify-center bg-[rgb(10_10_10_/_0.36)] px-4 py-8 backdrop-blur-2xl">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,rgb(255_255_255_/_0.07),rgb(255_255_255_/_0.025)_38%,rgb(0_0_0_/_0.18))]" />
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-xl border border-white/10 bg-surface-elevated/55 p-6 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-deep/70 shadow-sm">
              <img src="/trace-icon.svg" alt="" className="size-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">Trace</div>
              <div className="truncate text-xs text-muted-foreground">Start a workspace</div>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-surface-deep/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            No organization
          </span>
        </div>

        <h1 className="mt-8 text-[1.9rem] font-semibold leading-tight text-foreground">
          Create your organization
        </h1>
        <p className="mt-2 max-w-[460px] text-sm leading-6 text-muted-foreground">
          You are signed in, but this account is not part of a Trace organization yet.
          Create an organization to start using your workspace.
        </p>

        <div className="mt-6 rounded-lg border border-white/10 bg-surface-deep/55 p-3.5 shadow-inner shadow-black/20">
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

        <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <CreateOrganizationDialog
            trigger={
              <Button size="lg" className="w-full justify-center gap-2">
                <Plus size={14} />
                Create organization
              </Button>
            }
          />
          <Button
            onClick={handleCheckAgain}
            disabled={checking}
            variant="outline"
            className="gap-2 bg-surface-deep/45"
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
