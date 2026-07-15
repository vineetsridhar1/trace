import type { ComponentType } from "react";
import type { DesignScreen } from "./manifest";
import { ArtboardErrorBoundary } from "./ArtboardErrorBoundary";

export function DesignArtboard({
  screen,
  sectionName,
  component: ScreenComponent,
  onFocus,
  zoom,
}: {
  screen: DesignScreen;
  sectionName: string;
  component: ComponentType;
  onFocus: () => void;
  zoom: number;
}) {
  const inverseZoom = 1 / zoom;
  const labelWidth = screen.viewport.width * zoom;

  return (
    <article
      data-screen-id={screen.id}
      className="relative"
      style={{ width: screen.viewport.width }}
    >
      <div
        className="absolute left-0"
        style={{
          bottom: screen.viewport.height + 12 * inverseZoom,
          transform: `scale(${inverseZoom})`,
          transformOrigin: "bottom left",
          width: labelWidth,
        }}
      >
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600"
        >
          {sectionName}
        </p>
        <header className="flex items-end justify-between gap-3 text-zinc-200">
          <div>
            <h2 className="text-sm font-medium">{screen.name}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {[screen.variation, screen.state].filter(Boolean).join(" · ") || "Default"}
            </p>
          </div>
          <button
            type="button"
            onClick={onFocus}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            Focus
          </button>
        </header>
      </div>
      <div
        className="overflow-hidden rounded-[20px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
        style={{ width: screen.viewport.width, height: screen.viewport.height }}
      >
        <ArtboardErrorBoundary screenName={screen.name}>
          <ScreenComponent />
        </ArtboardErrorBoundary>
      </div>
    </article>
  );
}
