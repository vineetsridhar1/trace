import { isCanvasLabelVisible } from "./viewport";

// Screen-space gap between the bottom of the label and the top of its first artboard.
export const SECTION_LABEL_GAP = 102;
// Keep in sync with the heading font size and line height below.
const SECTION_LABEL_FONT_SIZE = 28;
const SECTION_LABEL_HEIGHT = 36;

export function DesignSectionLabel({
  name,
  zoom,
  clearanceAbove,
}: {
  name: string;
  zoom: number;
  clearanceAbove: number;
}) {
  const visible = isCanvasLabelVisible({
    fontSize: SECTION_LABEL_FONT_SIZE,
    blockHeight: SECTION_LABEL_GAP + SECTION_LABEL_HEIGHT,
    clearanceAbove,
    zoom,
  });
  if (!visible) return null;

  return (
    // Anchored to the bottom of its zero-height wrapper so the gap below the label stays
    // constant on screen — scaling about the bottom edge keeps that edge put.
    <h2
      className="absolute bottom-0 left-0 origin-bottom-left whitespace-nowrap text-[28px] font-semibold leading-9 uppercase tracking-[0.18em] text-zinc-600"
      style={{ transform: `scale(${1 / zoom})` }}
    >
      {name}
    </h2>
  );
}
