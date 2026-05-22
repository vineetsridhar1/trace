import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  LogOut,
  RefreshCw,
} from "lucide-react";
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
  const name = user?.name?.trim() ?? "";
  const accountLabel = name || email || "No account details available";
  const welcomeMessage = isLocalMode
    ? "Create an organization to start your local workspace, or ask an admin to invite you and share the email below."
    : "You are signed in, but this account is not part of a Trace organization yet.";

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
                {isLocalMode ? "Local workspace" : "Invite-only beta"}
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-surface-deep px-2.5 py-1 text-xs font-medium text-muted-foreground">
            No organization
          </span>
        </div>

        <h1 className="mt-7 text-[1.7rem] font-semibold leading-tight text-foreground">
          Invite required
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{welcomeMessage}</p>

        {!isLocalMode ? (
          <div className="mt-6">
            <div className="text-xs font-medium uppercase text-muted-foreground">Ways forward</div>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
              <div className="p-3.5">
                <div>
                  <div className="text-sm font-medium text-foreground">Get invited</div>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    Ask a Trace admin to add the email below to an organization.
                  </p>
                </div>
              </div>
              <div className="p-3.5">
                <div>
                  <div className="text-sm font-medium text-foreground">Run locally</div>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    Start the full local workspace with{" "}
                    <code className="rounded bg-surface-deep px-1 py-0.5 text-xs text-foreground">
                      pnpm dev:local
                    </code>
                    .
                  </p>
                </div>
              </div>
              <div className="p-3.5">
                <div>
                  <div className="text-sm font-medium text-foreground">Self-host</div>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    Deploy Trace on your own server with the Docker Compose setup.
                  </p>
                </div>
              </div>
            </div>
            <a
              href={RUNNING_TRACE_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "mt-4 w-full justify-between",
              )}
            >
              <span className="flex items-center gap-2">
                Open setup guide
                <ExternalLink size={14} />
              </span>
              <ArrowRight size={14} className="text-muted-foreground" />
            </a>
          </div>
        ) : null}

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
          {isLocalMode ? <CreateOrganizationDialog /> : null}
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
