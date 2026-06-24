import { cn } from "@/lib/utils";
import { useUIStore, type BrowserTab, type UIState } from "../../stores/ui";
import { BrowserPane } from "./BrowserPane";
import { BrowserTabStrip } from "./BrowserTabStrip";

export function BrowserView({ active }: { active: boolean }) {
  const tabs = useUIStore((s: UIState) => s.browserTabs);
  const activeId = useUIStore((s: UIState) => s.activeBrowserTabId);

  if (tabs.length === 0 && !active) return null;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-background", !active && "hidden")}>
      <BrowserTabStrip />
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab: BrowserTab) => (
          <BrowserPane key={tab.id} tab={tab} active={tab.id === activeId} />
        ))}
      </div>
    </div>
  );
}
