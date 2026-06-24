import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Code, ExternalLink, Globe, RotateCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { useSessionBrowserStore, type BrowserTabEntry } from "../../stores/session-browser";
import { WebviewFrame, type WebviewHandle } from "./WebviewFrame";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const isDesktopShell = typeof window !== "undefined" && typeof window.trace !== "undefined";

export function SessionBrowserPane({ tab, active }: { tab: BrowserTabEntry; active: boolean }) {
  const setBrowserUrl = useSessionBrowserStore((s) => s.setBrowserUrl);
  const [input, setInput] = useState(tab.url);
  const [reloadKey, setReloadKey] = useState(0);
  const webviewRef = useRef<WebviewHandle>(null);

  useEffect(() => {
    setInput(tab.url);
  }, [tab.url]);

  const reload = () => {
    if (isDesktopShell) webviewRef.current?.reload();
    else setReloadKey((k) => k + 1);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeUrl(input);
    setInput(next);
    if (next !== tab.url) {
      setBrowserUrl(tab.id, next);
    } else {
      reload();
    }
  };

  return (
    <div className={cn("absolute inset-0 flex flex-col bg-background", !active && "hidden")}>
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1 border-b border-border/70 bg-surface-mid px-2 py-1.5"
      >
        {isDesktopShell && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Back"
              aria-label="Back"
              disabled={!tab.url}
              onClick={() => webviewRef.current?.goBack()}
            >
              <ArrowLeft size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Forward"
              aria-label="Forward"
              disabled={!tab.url}
              onClick={() => webviewRef.current?.goForward()}
            >
              <ArrowRight size={14} />
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Reload"
          aria-label="Reload"
          disabled={!tab.url}
          onClick={reload}
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
        {isDesktopShell && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Open DevTools (console, network)"
            aria-label="Open DevTools"
            disabled={!tab.url}
            onClick={() => webviewRef.current?.openDevTools()}
          >
            <Code size={14} />
          </Button>
        )}
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
      <div className="relative min-h-0 flex-1 bg-white">
        {tab.url ? (
          isDesktopShell ? (
            <WebviewFrame ref={webviewRef} url={tab.url} />
          ) : (
            <iframe
              key={`${tab.id}:${reloadKey}`}
              src={tab.url}
              title={tab.title}
              className="size-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            />
          )
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
            <Globe size={32} className="opacity-50" />
            <p className="text-sm">Enter a URL to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
