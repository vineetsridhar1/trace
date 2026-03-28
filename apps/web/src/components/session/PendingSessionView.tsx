import { Loader2, Send } from "lucide-react";

/**
 * Shown immediately when a session is being created, before the server responds.
 * Mirrors the layout of SessionDetailView + SessionInput so the transition is seamless.
 */
export function PendingSessionView() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header placeholder */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Creating session…</span>
      </div>

      {/* Empty message area */}
      <div className="flex-1" />

      {/* Disabled input — mirrors SessionInput layout */}
      <div className="shrink-0 border-t px-4 py-3">
        <div className="flex items-center gap-2">
          <textarea
            disabled
            placeholder="What should the agent work on?"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-surface-deep px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <button
            disabled
            className="my-0.5 shrink-0 self-stretch rounded-lg bg-primary px-3 text-primary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
