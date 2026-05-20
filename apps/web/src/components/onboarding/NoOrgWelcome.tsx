import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, ExternalLink, LogOut, RefreshCw } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "../ui/button";
import { isLocalMode } from "../../lib/runtime-mode";
import { CreateOrganizationDialog } from "../sidebar/CreateOrganizationDialog";
import { TraceLoader } from "../ui/trace-loader";

const RUNNING_TRACE_DOC_URL =
  "https://github.com/vineetsridhar1/trace/blob/main/docs/running-trace.md";

export function NoOrgWelcome() {
  const user = useAuthStore((s: AuthState) => s.user);
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const email = user?.email ?? "";
  const welcomeMessage = isLocalMode
    ? "Create an organization to start your local workspace, or ask an admin to invite you and share the email below."
    : "Trace Cloud is invite-only right now. You can wait for an invite, run Trace locally, or self-host it with the setup guide.";

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
    <div className="flex h-dvh items-center justify-center bg-surface-deep px-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface-elevated p-8 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">
          T
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-foreground">Welcome to Trace</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{welcomeMessage}</p>

        {!isLocalMode ? (
          <div className="mt-6 rounded-lg border border-border bg-surface-deep p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BookOpen size={15} />
              Ways forward
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>Ask a Trace admin to invite the email below.</li>
              <li>Run the full local workspace with `pnpm dev:local`.</li>
              <li>Deploy Trace on your own server with Docker Compose.</li>
            </ul>
            <a
              href={RUNNING_TRACE_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 gap-2")}
            >
              Open setup guide
              <ExternalLink size={13} />
            </a>
          </div>
        ) : null}

        <div className="mt-6">
          <label className="text-xs font-medium uppercase text-muted-foreground">Your email</label>
          <div className="mt-2 flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface-deep px-3 py-2">
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

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {isLocalMode ? <CreateOrganizationDialog /> : null}
          <Button onClick={handleCheckAgain} disabled={checking} className="gap-2">
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
