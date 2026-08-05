import type { ComponentType } from "react";
import type { DesignScreen } from "./manifest";
import { ArtboardErrorBoundary } from "./ArtboardErrorBoundary";
import { isCanvasLabelVisible } from "./viewport";

// Keep in sync with the screen name font size below.
const SCREEN_LABEL_FONT_SIZE = 20;
const SCREEN_LABEL_GAP = 12;
// Screen-space height of the label: name (28) + margin (6) + variation line (24).
const SCREEN_LABEL_HEIGHT = 58;

export function DesignArtboard({
  screen,
  component: ScreenComponent,
  zoom,
  clearanceAbove,
}: {
  screen: DesignScreen;
  component: ComponentType;
  zoom: number;
  clearanceAbove: number;
}) {
  const inverseZoom = 1 / zoom;
  const labelWidth = screen.viewport.width * zoom;

  return (
    <article
      data-screen-id={screen.id}
      className="relative"
      style={{ width: screen.viewport.width }}
    >
      {isCanvasLabelVisible({
        fontSize: SCREEN_LABEL_FONT_SIZE,
        blockHeight: SCREEN_LABEL_GAP + SCREEN_LABEL_HEIGHT,
        clearanceAbove,
        zoom,
      }) ? (
        <div
          className="absolute left-0"
          style={{
            bottom: screen.viewport.height + SCREEN_LABEL_GAP * inverseZoom,
            transform: `scale(${inverseZoom})`,
            transformOrigin: "bottom left",
            width: labelWidth,
          }}
        >
          <header className="flex items-end justify-between gap-3 text-zinc-200">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[20px] font-medium leading-7">{screen.name}</h2>
              <p className="mt-1.5 truncate text-[16px] leading-6 text-zinc-500">
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
