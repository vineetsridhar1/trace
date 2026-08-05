import { isCanvasLabelVisible } from "./viewport";

// Keep in sync with the heading font size below.
const SECTION_LABEL_FONT_SIZE = 28;

export function DesignSectionLabel({ name, zoom }: { name: string; zoom: number }) {
  if (!isCanvasLabelVisible(SECTION_LABEL_FONT_SIZE, zoom)) return null;

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
