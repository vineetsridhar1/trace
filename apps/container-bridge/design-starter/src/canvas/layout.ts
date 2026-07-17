import type { DesignManifest, DesignScreen } from "./manifest";

const GAP = 96;
const SECTION_GAP = 180;

export type PlacedScreen = {
  screen: DesignScreen;
  x: number;
  y: number;
  sectionName: string;
};

/** Arrange each section as a horizontal flow row, with sections stacked vertically. */
export function placeScreens(manifest: DesignManifest): PlacedScreen[] {
  const byId = new Map(manifest.screens.map((screen) => [screen.id, screen]));
  let sectionY = 0;
  const result: PlacedScreen[] = [];

  for (const section of manifest.sections) {
    let fallbackX = 0;
    let maxBottom = sectionY;
    for (const id of section.screenIds) {
      const screen = byId.get(id)!;
      const x = screen.position?.x ?? fallbackX;
      const y = screen.position ? sectionY + screen.position.y : sectionY + 54;
      result.push({ screen, x, y, sectionName: section.name });
      fallbackX = Math.max(fallbackX, x + screen.viewport.width + GAP);
      maxBottom = Math.max(maxBottom, y + screen.viewport.height);
    }
    sectionY = maxBottom + SECTION_GAP;
  }

  return result;
}
