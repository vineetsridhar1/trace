import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useUIStore, type BrowserTab, type UIState } from "../../stores/ui";

export function BrowserTabStrip() {
  const tabs = useUIStore((s: UIState) => s.browserTabs);
  const activeId = useUIStore((s: UIState) => s.activeBrowserTabId);
  const setActiveBrowserTabId = useUIStore((s: UIState) => s.setActiveBrowserTabId);
  const closeBrowserTab = useUIStore((s: UIState) => s.closeBrowserTab);
  const openBrowserTab = useUIStore((s: UIState) => s.openBrowserTab);

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border/70 bg-background/40 px-2 py-1">
      {tabs.map((tab: BrowserTab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          onClick={() => setActiveBrowserTabId(tab.id)}
          className={cn(
            "group flex max-w-44 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs",
            tab.id === activeId
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          <span className="truncate">{tab.title}</span>
          <button
            type="button"
            aria-label={`Close ${tab.title}`}
            className="shrink-0 rounded p-0.5 opacity-0 hover:bg-background/80 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              closeBrowserTab(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title="New tab"
        aria-label="New tab"
        onClick={() => openBrowserTab("")}
      >
        <Plus size={14} />
      </Button>
    </div>
  );
}
