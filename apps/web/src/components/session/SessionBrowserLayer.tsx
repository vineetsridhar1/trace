import { cn } from "../../lib/utils";
import type { BrowserTabEntry } from "../../stores/session-browser";
import { SessionBrowserPane } from "./SessionBrowserPane";

interface SessionBrowserLayerProps {
  browsers: BrowserTabEntry[];
  activeBrowserId: string | null;
}

// Renders every browser tab for the group at once, toggling visibility with
// `hidden`. Iframes/webviews keep their page state while hidden, so switching
// between a browser and another tab (or back) doesn't reload the page.
export function SessionBrowserLayer({ browsers, activeBrowserId }: SessionBrowserLayerProps) {
  if (browsers.length === 0) return null;
  const show = !!activeBrowserId && browsers.some((b) => b.id === activeBrowserId);

  return (
    <div className={cn("absolute inset-0", !show && "hidden")}>
      {browsers.map((tab) => (
        <SessionBrowserPane key={tab.id} tab={tab} active={tab.id === activeBrowserId} />
      ))}
    </div>
  );
}
