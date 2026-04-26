import { useEffect, useRef, useState } from "react";
import { Copy, LogOut, RefreshCw, Check } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";
import { CreateOrganizationDialog } from "../sidebar/CreateOrganizationDialog";

export function NoOrgWelcome() {
  const user = useAuthStore((s: AuthState) => s.user);
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const email = user?.email ?? "";

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
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
    <div className="flex h-dvh items-center justify-center bg-surface-deep px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-elevated p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Trace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create an organization to start your own workspace, or ask an admin to invite
          you and share the email below.
        </p>

        <div className="mt-6">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your email
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-md border border-border bg-surface-deep px-3 py-2">
            <span className="flex-1 truncate text-sm text-foreground">{email}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <CreateOrganizationDialog />
          <Button onClick={handleCheckAgain} disabled={checking} className="gap-2">
            <RefreshCw size={14} className={checking ? "animate-spin" : undefined} />
            {checking ? "Checking..." : "Check again"}
          </Button>
          <Button variant="ghost" onClick={logout} className="gap-2 text-destructive">
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
