import {
  AppWindow,
  Files,
  GitCompareArrows,
  Globe,
  Send,
  TerminalSquare,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { WorkspaceSurface } from "./SidebarPanel";

interface SpatialNewTabProps {
  canStartChat: boolean;
  canShowApplications: boolean;
  onStartChat: (prompt: string) => Promise<void>;
  onConvert: (surface: WorkspaceSurface) => void;
}

const quickStarts: Array<{
  surface: WorkspaceSurface;
  label: string;
  detail: string;
  icon: typeof Globe;
}> = [
  { surface: "browser", label: "Open browser", detail: "Preview a running app", icon: Globe },
  { surface: "changes", label: "Files changed", detail: "Review the current diff", icon: GitCompareArrows },
  { surface: "terminal", label: "Open terminal", detail: "Start a shell or task", icon: TerminalSquare },
  { surface: "files", label: "Browse files", detail: "Explore the repository", icon: Files },
  { surface: "applications", label: "Applications", detail: "See working cloud URLs", icon: AppWindow },
];

export function SpatialNewTab({
  canStartChat,
  canShowApplications,
  onStartChat,
  onConvert,
}: SpatialNewTabProps) {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const availableStarts = quickStarts.filter(
    (item) => item.surface !== "applications" || canShowApplications,
  );

  const submit = async () => {
    if (!canStartChat || submitting || !prompt.trim()) return;
    setSubmitting(true);
    try {
      await onStartChat(prompt.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-background px-8 py-10">
      <div className="w-full max-w-3xl">
        <h1 className="text-center text-xl font-semibold tracking-tight text-foreground">
          What do you want to work on?
        </h1>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          New tabs start as chats, or convert this tab into another workspace surface.
        </p>

        <div className="mt-7 rounded-2xl border border-border bg-surface-deep p-3 shadow-xl shadow-black/20">
          <textarea
            autoFocus
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Codex to build, fix, or explain…"
            className="h-20 w-full resize-none bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center text-[11px] text-muted-foreground">
            <span>Code</span>
            <span className="ml-3">⌘ Enter to send</span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canStartChat || submitting || !prompt.trim()}
              className="ml-auto flex size-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-35"
              aria-label="Start chat"
            >
              <Send size={13} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {availableStarts.slice(0, 4).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.surface}
                type="button"
                onClick={() => onConvert(item.surface)}
                className="group rounded-xl border border-border bg-surface-mid p-3 text-left transition-colors hover:border-muted-foreground/50 hover:bg-surface-hover"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Icon size={13} className="text-muted-foreground group-hover:text-foreground" />
                  {item.label}
                </span>
                <span className="mt-1.5 block text-[10px] leading-4 text-muted-foreground">
                  {item.detail}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          Drag any tab toward an edge to create a region.
        </p>
      </div>
    </div>
  );
}
