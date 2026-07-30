import { CircleDashed, ChevronRight } from "lucide-react";
import { useOnboardingStatus } from "../../hooks/useOnboardingStatus";
import { OnboardingChecklist } from "../onboarding/OnboardingChecklist";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function SidebarGettingStartedItem() {
  const status = useOnboardingStatus();
  if (status.loading || status.allDone) return null;
  const progress = Math.round((status.completedCount / status.totalCount) * 100);

  return (
    <Popover>
      <div className="border-t border-white/10 px-2 py-1.5">
        <PopoverTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]">
          <span className="relative flex size-6 shrink-0 items-center justify-center">
            <CircleDashed className="size-4 text-[var(--th-accent-light)]" />
            <span
              className="absolute bottom-0 h-0.5 rounded-full bg-[var(--th-accent)]"
              style={{ width: `${Math.max(4, progress / 5)}px` }}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">
              Getting started
            </span>
            <span className="block text-[10px] text-[var(--th-muted)]">
              {status.completedCount} of {status.totalCount} complete
            </span>
          </span>
          <ChevronRight className="size-3.5 text-[var(--th-faint)]" />
        </PopoverTrigger>
      </div>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="max-h-[min(680px,calc(100dvh-3rem))] w-[min(380px,calc(100vw-1rem))] overflow-y-auto border border-[var(--th-edge-strong)] bg-[var(--th-raised)] p-4 shadow-[0_16px_48px_rgb(0_0_0/0.55)]"
      >
        <OnboardingChecklist status={status} />
      </PopoverContent>
    </Popover>
  );
}
