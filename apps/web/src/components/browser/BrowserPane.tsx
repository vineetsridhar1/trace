import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Globe, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useUIStore, type BrowserTab, type UIState } from "../../stores/ui";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function BrowserPane({ tab, active }: { tab: BrowserTab; active: boolean }) {
  const setBrowserTabUrl = useUIStore((s: UIState) => s.setBrowserTabUrl);
  const [input, setInput] = useState(tab.url);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setInput(tab.url);
  }, [tab.url]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeUrl(input);
    setInput(next);
    if (next !== tab.url) {
      setBrowserTabUrl(tab.id, next);
    } else {
      setReloadKey((k) => k + 1);
    }
  };

  return (
    <div className={cn("absolute inset-0 flex flex-col", !active && "hidden")}>
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1 border-b border-border/70 bg-background/60 px-2 py-1.5"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Reload"
          aria-label="Reload"
          disabled={!tab.url}
          onClick={() => setReloadKey((k) => k + 1)}
        >
          <RotateCw size={14} />
        </Button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a URL"
          spellCheck={false}
          className="h-7 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Open in system browser"
          aria-label="Open in system browser"
          disabled={!tab.url}
          onClick={() => window.open(tab.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink size={14} />
        </Button>
      </form>
      <div className="relative min-h-0 flex-1 bg-background">
        {tab.url ? (
          <iframe
            key={`${tab.id}:${reloadKey}`}
            src={tab.url}
            title={tab.title}
            className="size-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Globe size={32} className="opacity-50" />
            <p className="text-sm">Enter a URL to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
