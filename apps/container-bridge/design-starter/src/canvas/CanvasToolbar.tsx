type CanvasToolbarProps = {
  zoom: number;
  focused: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onClearFocus: () => void;
};

export function CanvasToolbar({
  zoom,
  focused,
  onZoomIn,
  onZoomOut,
  onFit,
  onClearFocus,
}: CanvasToolbarProps) {
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 text-sm text-white shadow-2xl backdrop-blur">
      <button
        type="button"
        onClick={onZoomOut}
        className="rounded-lg px-3 py-2 hover:bg-white/10"
        aria-label="Zoom out"
      >
        −
      </button>
      <span className="w-14 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        onClick={onZoomIn}
        className="rounded-lg px-3 py-2 hover:bg-white/10"
        aria-label="Zoom in"
      >
        +
      </button>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <button type="button" onClick={onFit} className="rounded-lg px-3 py-2 hover:bg-white/10">
        Fit
      </button>
      {focused ? (
        <button
          type="button"
          onClick={onClearFocus}
          className="rounded-lg px-3 py-2 hover:bg-white/10"
        >
          All screens
        </button>
      ) : null}
      {location.protocol !== "file:" ? (
        <a
          href="/__trace_design_export"
          download="design.html"
          className="rounded-lg bg-white px-3 py-2 font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Export HTML
        </a>
      ) : null}
    </div>
  );
}
