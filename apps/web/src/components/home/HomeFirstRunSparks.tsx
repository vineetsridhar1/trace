import { HomeKindIcon } from "./HomeKindIcon";
import type { SessionGroupKind } from "@trace/gql";

const SPARKS: Array<{ kind: SessionGroupKind; prompt: string }> = [
  {
    kind: "design",
    prompt: "A warmer onboarding flow for my meditation app",
  },
  {
    kind: "coding",
    prompt: "Find and fix the slowest part of our dashboard",
  },
  {
    kind: "app",
    prompt: "A lightweight launch tracker for a small product team",
  },
];

export function HomeFirstRunSparks({ onUsePrompt }: { onUsePrompt: (prompt: string) => void }) {
  return (
    <section className="mx-auto mt-10 w-full max-w-[720px]">
      <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--th-faint)]">
        Or start from a spark
      </p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {SPARKS.map((spark) => (
          <button
            key={spark.prompt}
            type="button"
            onClick={() => onUsePrompt(spark.prompt)}
            className="group rounded-[10px] border border-[var(--th-edge)] bg-[var(--th-surface)] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--th-edge-hover)] hover:bg-[var(--th-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)] motion-reduce:hover:translate-y-0"
          >
            <HomeKindIcon kind={spark.kind} className="mb-2 size-3.5" />
            <span className="block text-[12.5px] leading-[1.45] text-[var(--th-primary)] group-hover:text-[var(--th-heading)]">
              {spark.prompt}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-[var(--th-faint)]">
        Your work will collect here once you start something
      </p>
    </section>
  );
}
