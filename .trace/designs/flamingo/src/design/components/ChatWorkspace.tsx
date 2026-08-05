import type { ReactNode } from "react";
import { DesignScreen } from "../primitives/DesignScreen";
import { SparkIcon } from "./ArtifactIcons";

type ChatWorkspaceProps = {
  children: ReactNode;
  title?: string;
  description: string;
};

export function ChatWorkspace({ children, title = "Replay the five-round game", description }: ChatWorkspaceProps) {
  return (
    <DesignScreen
      data-trace-id="chat-workspace"
      data-trace-source="src/design/components/ChatWorkspace.tsx"
      className="overflow-hidden bg-design-background"
    >
      <header
        data-trace-id="chat-topbar"
        data-trace-source="src/design/components/ChatWorkspace.tsx"
        className="flex h-16 items-center justify-between border-b border-design-border px-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-design-control border border-design-border bg-design-surface text-design-primary">
            <SparkIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                data-trace-id="session-status"
                data-trace-source="src/design/components/ChatWorkspace.tsx"
                className="h-2 w-2 rounded-full bg-design-success"
              />
              <h1
                data-trace-id="session-title"
                data-trace-source="src/design/components/ChatWorkspace.tsx"
                className="truncate text-sm font-semibold tracking-[-0.01em]"
              >
                {title}
              </h1>
            </div>
            <p
              data-trace-id="session-context"
              data-trace-source="src/design/components/ChatWorkspace.tsx"
              className="mt-0.5 text-xs text-design-muted"
            >
              Working locally · main
            </p>
          </div>
        </div>
        <div
          data-trace-id="session-actions"
          data-trace-source="src/design/components/ChatWorkspace.tsx"
          className="flex items-center gap-2"
        >
          <button className="min-h-10 rounded-design-control border border-design-border bg-design-surface px-4 text-xs font-semibold text-design-foreground transition hover:border-design-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary">
            Create PR
          </button>
          <button className="min-h-10 rounded-design-control border border-design-border px-4 text-xs font-semibold text-design-muted transition hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary">
            Share
          </button>
        </div>
      </header>

      <div className="grid h-[calc(100%-4rem)] grid-cols-[232px_minmax(0,1fr)]">
        <aside
          data-trace-id="chat-sidebar"
          data-trace-source="src/design/components/ChatWorkspace.tsx"
          className="flex flex-col border-r border-design-border bg-design-surface/40 p-4"
        >
          <button className="flex min-h-11 items-center gap-3 rounded-design-control bg-design-surface px-3 text-left text-sm font-medium">
            <span className="h-2 w-2 rounded-full bg-design-primary" />
            Current chat
          </button>
          <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-design-muted">
            Today
          </p>
          <button className="min-h-10 truncate rounded-design-control px-3 text-left text-xs text-design-muted hover:bg-design-surface hover:text-design-foreground">
            Add play-again action
          </button>
          <button className="min-h-10 truncate rounded-design-control px-3 text-left text-xs text-design-muted hover:bg-design-surface hover:text-design-foreground">
            Polish empty state
          </button>
          <div className="mt-auto rounded-design-control border border-design-border p-3">
            <p className="text-xs font-medium">Local workspace</p>
            <p className="mt-1 text-[11px] text-design-muted">2 files changed</p>
          </div>
        </aside>

        <section
          data-trace-id="conversation-region"
          data-trace-source="src/design/components/ChatWorkspace.tsx"
          className="relative overflow-y-auto"
        >
          <div className="mx-auto flex min-h-full max-w-[920px] flex-col px-12 pb-28 pt-12">
            <div
              data-trace-id="user-message"
              data-trace-source="src/design/components/ChatWorkspace.tsx"
              className="ml-auto max-w-[660px] rounded-[18px] rounded-br-[5px] bg-design-surface px-5 py-3.5 text-[15px] leading-6"
            >
              Add a clear Play Again action after the final reveal, then show me the implementation plan.
            </div>
            <div className="mt-9 flex gap-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-surface text-design-primary">
                <SparkIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  data-trace-id="assistant-message"
                  data-trace-source="src/design/components/ChatWorkspace.tsx"
                  className="max-w-[760px] text-[15px] leading-7 text-design-foreground"
                >
                  {description}
                </p>
                <div className="mt-5">{children}</div>
                <p
                  data-trace-id="assistant-followup"
                  data-trace-source="src/design/components/ChatWorkspace.tsx"
                  className="mt-5 text-[13px] leading-6 text-design-muted"
                >
                  I’ve kept the replay transition local—no persistence, routes, or schema changes.
                </p>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-design-background via-design-background to-transparent" />
          <div
            data-trace-id="chat-composer"
            data-trace-source="src/design/components/ChatWorkspace.tsx"
            className="absolute bottom-5 left-1/2 flex min-h-14 w-[min(760px,calc(100%-96px))] -translate-x-1/2 items-center rounded-design-surface border border-design-border bg-design-surface px-5 shadow-design-surface"
          >
            <span className="text-sm text-design-muted">Ask a follow-up…</span>
            <span className="ml-auto rounded-design-control bg-design-primary px-3 py-1.5 text-xs font-semibold text-design-primary-foreground">Send</span>
          </div>
        </section>
      </div>
    </DesignScreen>
  );
}
