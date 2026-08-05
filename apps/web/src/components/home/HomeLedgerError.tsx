import { RefreshCw } from "lucide-react";

export function HomeLedgerError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="mx-auto mt-9 flex w-full max-w-[720px] flex-col items-center rounded-lg border border-[var(--th-edge)] bg-[var(--th-surface)] px-5 py-8 text-center">
      <p className="text-sm font-medium text-[var(--th-heading)]">Your work could not be loaded</p>
      <p className="mt-1 max-w-md text-xs text-[var(--th-muted)]">
        Trace kept this separate from an empty workspace so existing sessions are not mistaken for
        first-run onboarding.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-secondary mt-4 flex items-center gap-1.5 rounded-md border border-[var(--th-edge-hover)] px-3 py-1.5 text-xs text-foreground"
      >
        <RefreshCw className="size-3.5" />
        Try again
      </button>
    </section>
  );
}
