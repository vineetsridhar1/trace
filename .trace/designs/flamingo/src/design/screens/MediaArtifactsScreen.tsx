import { useState } from "react";
import { ArrowIcon, ImageIcon, MoreIcon, VideoIcon } from "../components/ArtifactIcons";
import { ChatWorkspace } from "../components/ChatWorkspace";

export default function MediaArtifactsScreen() {
  const [playing, setPlaying] = useState(false);

  return (
    <ChatWorkspace
      title="Polish the results screen"
      description="I captured the updated result state and a short interaction preview."
    >
      <div
        data-trace-id="media-artifact-grid"
        data-trace-source="src/design/screens/MediaArtifactsScreen.tsx"
        className="grid grid-cols-2 gap-3"
      >
        <article className="overflow-hidden rounded-design-surface border border-design-border bg-design-surface shadow-design-surface">
          <div
            data-trace-id="screenshot-preview"
            data-trace-source="src/design/screens/MediaArtifactsScreen.tsx"
            className="relative h-44 border-b border-design-border bg-design-background p-5"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-design-primary/10 via-transparent to-design-surface" />
            <div className="relative mx-auto h-full max-w-[230px] rounded-[10px] border border-design-border bg-design-surface p-3 shadow-design-surface">
              <div className="flex items-center justify-between">
                <span className="h-2 w-16 rounded-full bg-design-border" />
                <span className="h-5 w-5 rounded-full bg-design-primary/20" />
              </div>
              <div className="mt-6 text-center">
                <div className="mx-auto h-9 w-9 rounded-full border border-design-primary/40 bg-design-primary/10" />
                <div className="mx-auto mt-3 h-2 w-24 rounded-full bg-design-foreground/70" />
                <div className="mx-auto mt-2 h-1.5 w-32 rounded-full bg-design-border" />
              </div>
              <div className="mx-auto mt-5 h-6 w-24 rounded-md bg-design-primary" />
            </div>
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-design-border bg-design-background/90 px-2.5 py-1 text-[10px] font-semibold">
              <ImageIcon className="h-3.5 w-3.5 text-design-primary" /> PNG
            </span>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <h2 data-trace-id="screenshot-title" data-trace-source="src/design/screens/MediaArtifactsScreen.tsx" className="truncate text-[13px] font-semibold">Final reveal · updated</h2>
              <p className="mt-1 text-[11px] text-design-muted">1440 × 900 · 248 KB</p>
            </div>
            <button aria-label="More screenshot actions" className="flex h-10 w-10 items-center justify-center rounded-design-control text-design-muted hover:bg-design-background hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary">
              <MoreIcon className="h-4 w-4" />
            </button>
            <button className="flex min-h-10 items-center gap-1.5 rounded-design-control border border-design-border px-3 text-xs font-semibold hover:border-design-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary">
              Open <ArrowIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>

        <article className="overflow-hidden rounded-design-surface border border-design-border bg-design-surface shadow-design-surface">
          <button
            data-trace-id="video-preview"
            data-trace-source="src/design/screens/MediaArtifactsScreen.tsx"
            onClick={() => setPlaying((value) => !value)}
            className="relative block h-44 w-full overflow-hidden border-b border-design-border bg-design-background p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-design-primary"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-design-surface via-design-background to-design-primary/10" />
            <div className="relative h-full overflow-hidden rounded-[10px] border border-design-border bg-design-surface/80">
              <div className="flex h-8 items-center gap-1.5 border-b border-design-border px-3">
                <span className="h-1.5 w-1.5 rounded-full bg-design-danger" />
                <span className="h-1.5 w-1.5 rounded-full bg-design-warning" />
                <span className="h-1.5 w-1.5 rounded-full bg-design-success" />
              </div>
              <div className="grid grid-cols-[54px_1fr] p-3">
                <div className="space-y-2 border-r border-design-border pr-2">
                  <div className="h-1.5 rounded bg-design-border" /><div className="h-1.5 rounded bg-design-border" /><div className="h-1.5 rounded bg-design-border" />
                </div>
                <div className="px-4 pt-2"><div className="h-2 w-24 rounded bg-design-foreground/60" /><div className="mt-3 h-12 rounded border border-design-border bg-design-background" /></div>
              </div>
            </div>
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-design-border bg-design-background/90 px-2.5 py-1 text-[10px] font-semibold">
              <VideoIcon className="h-3.5 w-3.5 text-design-primary" /> 0:18
            </span>
            <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-design-primary text-design-primary-foreground shadow-design-surface">
              {playing ? <span className="flex gap-1"><i className="h-4 w-1 bg-design-primary-foreground" /><i className="h-4 w-1 bg-design-primary-foreground" /></span> : <span className="ml-0.5 text-base">▶</span>}
            </span>
          </button>
          <div className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <h2 data-trace-id="video-title" data-trace-source="src/design/screens/MediaArtifactsScreen.tsx" className="truncate text-[13px] font-semibold">Replay interaction</h2>
              <p className="mt-1 text-[11px] text-design-muted">MP4 · 4.2 MB</p>
            </div>
            <button aria-label="More video actions" className="flex h-10 w-10 items-center justify-center rounded-design-control text-design-muted hover:bg-design-background hover:text-design-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary">
              <MoreIcon className="h-4 w-4" />
            </button>
            <button className="flex min-h-10 items-center gap-1.5 rounded-design-control border border-design-border px-3 text-xs font-semibold hover:border-design-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-design-primary">
              Open <ArrowIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>
      </div>
    </ChatWorkspace>
  );
}
