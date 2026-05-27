import { useState } from "react";
import { LogOut, Plus, RefreshCw } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button } from "../ui/button";
import { CreateOrganizationDialog } from "../sidebar/CreateOrganizationDialog";
import { TraceLoader } from "../ui/trace-loader";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function NoOrgWelcome() {
  const user = useAuthStore((s: AuthState) => s.user);
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const [checking, setChecking] = useState(false);
  const email = user?.email ?? "";
  const name = user?.name?.trim() ?? "";
  const accountLabel = name || email || "No account details available";

  async function handleCheckAgain() {
    setChecking(true);
    await fetchMe();
    setChecking(false);
  }

  return (
    <div className="app-region-drag flex min-h-dvh items-center justify-center px-4 py-8 [background:var(--trace-window-bg)] backdrop-blur-2xl">
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-xl border border-white/10 bg-surface-elevated/45 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
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
          <div className="app-region-no-drag shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Check again"
                    disabled={checking}
                    className="bg-surface-deep/35 text-muted-foreground hover:bg-surface-hover/70 hover:text-foreground"
                    onClick={handleCheckAgain}
                  />
                }
              >
                {checking ? <TraceLoader size={14} showLabel={false} /> : <RefreshCw size={15} />}
              </TooltipTrigger>
              <TooltipContent side="bottom">Check again</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <h1 className="mt-8 text-[1.9rem] font-semibold leading-tight text-foreground">
          Create your organization
        </h1>
        <p className="mt-2 max-w-[460px] text-sm leading-6 text-muted-foreground">
          You are signed in, but this account is not part of a Trace organization yet.
          Create an organization to start using your workspace.
        </p>

        <div className="mt-6 rounded-lg border border-white/10 bg-surface-deep/55 p-3.5 shadow-inner shadow-black/20">
          <label className="mb-2 block text-xs font-medium uppercase text-muted-foreground">
            Your account
          </label>
          <div className="truncate text-sm font-medium text-foreground">{accountLabel}</div>
        </div>

        <div className="app-region-no-drag mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => void logout()} className="gap-2 text-destructive">
            <LogOut size={14} />
            Sign out
          </Button>
          <CreateOrganizationDialog
            trigger={
              <Button size="lg" className="justify-center gap-2">
                <Plus size={14} />
                Create organization
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
