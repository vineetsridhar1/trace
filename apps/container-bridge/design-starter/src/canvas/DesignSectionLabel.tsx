import { isCanvasLabelVisible } from "./viewport";

// Keep in sync with the heading font size below.
const SECTION_LABEL_FONT_SIZE = 28;

export function DesignSectionLabel({ name, zoom }: { name: string; zoom: number }) {
  if (!isCanvasLabelVisible(SECTION_LABEL_FONT_SIZE, zoom)) return null;

  return (
    <h2
      className="origin-bottom-left whitespace-nowrap text-[28px] font-semibold leading-9 uppercase tracking-[0.18em] text-zinc-600"
      style={{ transform: `scale(${1 / zoom})` }}
    >
      {name}
    </h2>
  );
}
