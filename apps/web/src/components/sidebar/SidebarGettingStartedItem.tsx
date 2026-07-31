import { ChevronDown, CircleDashed } from "lucide-react";
import { useState } from "react";
import { useOnboardingStatus } from "../../hooks/useOnboardingStatus";
import { OnboardingChecklist } from "../onboarding/OnboardingChecklist";

export function SidebarGettingStartedItem() {
  const status = useOnboardingStatus();
  const [expanded, setExpanded] = useState(true);
  if (status.loading || status.allDone) return null;

  return (
    <section className="border-y border-white/10 px-2 py-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="sidebar-getting-started-tasks"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]"
      >
        <CircleDashed className="size-4 shrink-0 text-[var(--th-accent-light)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-5 text-[var(--th-heading)]">
            Get set up
          </span>
          <span className="block text-[10px] text-[var(--th-muted)]">
            {status.completedCount} of {status.totalCount} complete
          </span>
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-[var(--th-muted)] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div id="sidebar-getting-started-tasks" className="mt-1">
          <OnboardingChecklist status={status} variant="sidebar" />
        </div>
      )}
    </section>
  );
}
