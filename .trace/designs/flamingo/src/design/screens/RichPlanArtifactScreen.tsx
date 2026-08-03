import { ArrowIcon, MoreIcon, PlanIcon } from "../components/ArtifactIcons";
import { ChatWorkspace } from "../components/ChatWorkspace";

export default function RichPlanArtifactScreen() {
  return (
    <ChatWorkspace description="I’ve prepared the implementation plan as an interactive HTML artifact. You can preview it here or open the full file.">
      <article
        data-trace-id="rich-plan-card"
        data-trace-source="src/design/screens/RichPlanArtifactScreen.tsx"
        className="overflow-hidden rounded-design-surface border border-design-border bg-design-surface shadow-design-surface"
      >
        <div
          data-trace-id="html-artifact-preview"
          data-trace-source="src/design/screens/RichPlanArtifactScreen.tsx"
          className="border-b border-design-border bg-design-background p-3"
        >
          <div className="overflow-hidden rounded-[10px] border border-design-border bg-design-surface">
            <div className="flex h-8 items-center gap-1.5 border-b border-design-border bg-design-background/70 px-3">
              <span className="h-1.5 w-1.5 rounded-full bg-design-danger" />
              <span className="h-1.5 w-1.5 rounded-full bg-design-warning" />
              <span className="h-1.5 w-1.5 rounded-full bg-design-success" />
              <span className="ml-3 font-design-mono text-[9px] text-design-muted">visual-plan.html</span>
              <span className="ml-auto rounded border border-design-border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-design-muted">Interactive preview</span>
            </div>
            <div className="h-[226px] overflow-auto bg-design-background px-9 py-7">
              <div className="mx-auto max-w-[600px]">
                <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-design-muted">Implementation plan</p>
                <h3 className="mt-2 text-[21px] font-semibold tracking-[-0.035em]">Replay the five-round game</h3>
                <p className="mt-2 max-w-[520px] text-[10px] leading-4 text-design-muted">
                  Add a clear Play Again action after the final reveal so a local game can start a fresh set of five rounds.
                </p>
                <div className="mt-5 grid grid-cols-[1.2fr_1fr] gap-3">
                  <div className="rounded-[8px] border border-design-border bg-design-surface p-3">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-design-muted">In scope</p>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-design-primary" /><span className="h-1.5 w-44 rounded-full bg-design-foreground/70" /></div>
                      <div className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-design-primary" /><span className="h-1.5 w-36 rounded-full bg-design-border" /></div>
                      <div className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-design-primary" /><span className="h-1.5 w-40 rounded-full bg-design-border" /></div>
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-design-border bg-design-surface p-3">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-design-muted">Approach</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-design-primary/40 text-[8px] text-design-primary">1</span>
                      <span className="h-px flex-1 bg-design-border" />
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-design-border text-[8px] text-design-muted">2</span>
                      <span className="h-px flex-1 bg-design-border" />
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-design-border text-[8px] text-design-muted">3</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <header className="flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-design-primary/10 text-design-primary">
            <PlanIcon className="h-[22px] w-[22px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                data-trace-id="rich-plan-kind"
                data-trace-source="src/design/screens/RichPlanArtifactScreen.tsx"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-design-primary"
              >
                HTML artifact
              </span>
              <span className="text-[10px] text-design-muted">· just now</span>
            </div>
            <h2
              data-trace-id="rich-plan-title"
              data-trace-source="src/design/screens/RichPlanArtifactScreen.tsx"
              className="mt-1 text-[15px] font-semibold tracking-[-0.01em]"
            >
              Implementation plan
            </h2>
            <p
              data-trace-id="rich-plan-summary"
              data-trace-source="src/design/screens/RichPlanArtifactScreen.tsx"
              className="mt-1 text-[11px] text-design-muted"
            >
              visual-plan.html · 38 KB
            </p>
          </div>
          <button aria-label="More artifact actions" className="flex h-10 w-10 items-center justify-center rounded-design-control text-design-muted hover:bg-design-background hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary">
            <MoreIcon className="h-5 w-5" />
          </button>
          <button
            data-trace-id="rich-plan-open"
            data-trace-source="src/design/screens/RichPlanArtifactScreen.tsx"
            className="ml-1 flex min-h-10 items-center gap-2 rounded-design-control bg-design-primary px-4 text-xs font-semibold text-design-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-primary"
          >
            Open artifact <ArrowIcon className="h-4 w-4" />
          </button>
        </header>
      </article>
    </ChatWorkspace>
  );
}
