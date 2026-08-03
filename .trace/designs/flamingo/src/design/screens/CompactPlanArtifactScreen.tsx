import { useState } from "react";
import { ArrowIcon, DownloadIcon, MoreIcon, PlanIcon } from "../components/ArtifactIcons";
import { ChatWorkspace } from "../components/ChatWorkspace";

export default function CompactPlanArtifactScreen() {
  const [opened, setOpened] = useState(false);

  return (
    <ChatWorkspace description="I mapped the change into a focused three-phase plan. The artifact is ready to review.">
      <article
        data-trace-id="compact-plan-card"
        data-trace-source="src/design/screens/CompactPlanArtifactScreen.tsx"
        className="group relative overflow-hidden rounded-design-surface border border-design-border bg-design-surface shadow-design-surface transition duration-design hover:border-design-secondary"
      >
        <div className="flex items-center gap-4 p-4">
          <div
            data-trace-id="compact-plan-icon"
            data-trace-source="src/design/screens/CompactPlanArtifactScreen.tsx"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-design-primary/25 bg-design-primary/10 text-design-primary"
          >
            <PlanIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                data-trace-id="compact-plan-kind"
                data-trace-source="src/design/screens/CompactPlanArtifactScreen.tsx"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-design-primary"
              >
                HTML artifact
              </span>
              <span className="text-[11px] text-design-muted">· just now</span>
            </div>
            <h2
              data-trace-id="compact-plan-title"
              data-trace-source="src/design/screens/CompactPlanArtifactScreen.tsx"
              className="mt-1 truncate text-[15px] font-semibold tracking-[-0.01em]"
            >
              Implementation plan
            </h2>
            <p
              data-trace-id="compact-plan-metadata"
              data-trace-source="src/design/screens/CompactPlanArtifactScreen.tsx"
              className="mt-1 text-xs text-design-muted"
            >
              visual-plan.html · 38 KB
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label="Download plan"
              className="flex h-10 w-10 items-center justify-center rounded-design-control text-design-muted hover:bg-design-background hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary"
            >
              <DownloadIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="More plan actions"
              className="flex h-10 w-10 items-center justify-center rounded-design-control text-design-muted hover:bg-design-background hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary"
            >
              <MoreIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              data-trace-id="compact-plan-open"
              data-trace-source="src/design/screens/CompactPlanArtifactScreen.tsx"
              onClick={() => setOpened((value) => !value)}
              className="ml-2 flex min-h-10 items-center gap-2 rounded-design-control bg-design-primary px-4 text-xs font-semibold text-design-primary-foreground transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-primary"
            >
              {opened ? "Opened" : "Open artifact"}
              <ArrowIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-design-primary/60 via-design-primary/15 to-transparent" />
      </article>
    </ChatWorkspace>
  );
}
