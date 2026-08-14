import type { DesignManifest, DesignScreen } from "./manifest";

const GAP = 96;
const SCREEN_LABEL_GUTTER = 90;
const SECTION_GAP = 220;

export type PlacedScreen = {
  screen: DesignScreen;
  x: number;
  y: number;
  sectionId: string;
  sectionName: string;
  /** Canvas-space room above the screen before the artboards of the section above start. */
  clearanceAbove: number;
};

/**
 * True when an artboard overlaps the viewport after the canvas transform has
 * been applied. `overscan` is expressed in screen pixels so panning does not
 * repeatedly mount and unmount screens at the viewport edge.
 */
export function isPlacedScreenVisible(
  screen: PlacedScreen,
  viewport: { x: number; y: number; zoom: number },
  viewportSize: { width: number; height: number },
  overscan: number,
): boolean {
  const left = screen.x * viewport.zoom + viewport.x;
  const top = screen.y * viewport.zoom + viewport.y;
  const right = left + screen.screen.viewport.width * viewport.zoom;
  const bottom = top + screen.screen.viewport.height * viewport.zoom;

  return (
    right >= -overscan &&
    bottom >= -overscan &&
    left <= viewportSize.width + overscan &&
    top <= viewportSize.height + overscan
  );
}

/** Arrange each section as a horizontal flow row, with sections stacked vertically. */
export function placeScreens(manifest: DesignManifest): PlacedScreen[] {
  const byId = new Map(manifest.screens.map((screen) => [screen.id, screen]));
  let sectionY = 0;
  let bottomAbove: number | null = null;
  const result: PlacedScreen[] = [];

  for (const section of manifest.sections) {
    let fallbackX = 0;
    let maxBottom = sectionY;
    for (const id of section.screenIds) {
      const screen = byId.get(id)!;
      const x = screen.position?.x ?? fallbackX;
      const y = sectionY + SCREEN_LABEL_GUTTER + (screen.position?.y ?? 0);
      result.push({
        screen,
        x,
        y,
        sectionId: section.id,
        sectionName: section.name,
        clearanceAbove: bottomAbove === null ? Number.POSITIVE_INFINITY : y - bottomAbove,
      });
      fallbackX = Math.max(fallbackX, x + screen.viewport.width + GAP);
      maxBottom = Math.max(maxBottom, y + screen.viewport.height);
    }
    bottomAbove = maxBottom;
    sectionY = maxBottom + SECTION_GAP;
  }

  return result;
}
