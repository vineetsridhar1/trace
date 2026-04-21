import { Check } from "lucide-react";
import { SidebarTrigger } from "../ui/sidebar";
import { useOnboardingStatus } from "../../hooks/useOnboardingStatus";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { useAuthStore, type AuthState } from "@trace/client-core";

export function HomeView() {
  const userName = useAuthStore((s: AuthState) => s.user?.name);
  const status = useOnboardingStatus();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <span className="text-sm font-medium text-foreground">Home</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">
              {greeting(userName)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {status.allDone
                ? "Pick a channel from the sidebar to get started."
                : "A few quick steps to finish setting up your workspace."}
            </p>
          </div>

          {status.allDone ? (
            <AllDoneCard />
          ) : (
            <OnboardingChecklist status={status} />
          )}
        </div>
      </div>
    </div>
  );
}

function greeting(name: string | null | undefined) {
  const firstName = (name ?? "").trim().split(" ")[0];
  return firstName ? `Welcome, ${firstName}` : "Welcome to Trace";
}

function AllDoneCard() {
  return (
    <div className="rounded-lg border border-border bg-surface-deep p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          <Check size={16} />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">You're all set</p>
          <p className="text-xs text-muted-foreground">
            Select a channel in the sidebar to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
