import type { ComponentType } from "react";
import type { DesignScreen } from "./manifest";
import { ArtboardErrorBoundary } from "./ArtboardErrorBoundary";
import { isCanvasLabelVisible } from "./viewport";

// Keep in sync with the screen name font size below.
const SCREEN_LABEL_FONT_SIZE = 24;

export function DesignArtboard({
  screen,
  component: ScreenComponent,
  zoom,
}: {
  screen: DesignScreen;
  component: ComponentType;
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
      {isCanvasLabelVisible(SCREEN_LABEL_FONT_SIZE, zoom) ? (
        <div
          className="absolute left-0"
          style={{
            bottom: screen.viewport.height + 12 * inverseZoom,
            transform: `scale(${inverseZoom})`,
            transformOrigin: "bottom left",
            width: labelWidth,
          }}
        >
          <header className="flex items-end justify-between gap-3 text-zinc-200">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[24px] font-medium leading-8">{screen.name}</h2>
              <p className="mt-2 truncate text-[18px] leading-[26px] text-zinc-500">
                {[screen.variation, screen.state].filter(Boolean).join(" · ") || "Default"}
              </p>
            </div>
          </header>
        </div>
      ) : null}
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
