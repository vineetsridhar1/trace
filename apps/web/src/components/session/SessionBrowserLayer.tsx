import { cn } from "../../lib/utils";
import type { BrowserTabEntry } from "../../stores/session-browser";
import { SessionBrowserPane } from "./SessionBrowserPane";

interface SessionBrowserLayerProps {
  browsers: BrowserTabEntry[];
  activeBrowserId: string | null;
}

// Renders every browser tab for the group at once. Keep inactive webviews in
// layout because Electron guest views can fail to paint after display:none.
export function SessionBrowserLayer({ browsers, activeBrowserId }: SessionBrowserLayerProps) {
  if (browsers.length === 0) return null;
  const show = !!activeBrowserId && browsers.some((b) => b.id === activeBrowserId);

  return (
    <div className={cn("absolute inset-0", !show && "pointer-events-none opacity-0")}>
      {browsers.map((tab) => (
        <SessionBrowserPane key={tab.id} tab={tab} active={tab.id === activeBrowserId} />
      ))}
    </div>
  );
}
