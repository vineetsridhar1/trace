import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Code2, LoaderCircle, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const EMPTY_BROWSER_STATE: DesktopBrowserWorkspaceState = {
  sessionGroupId: "",
  browserId: "",
  url: "about:blank",
  title: "New tab",
  canGoBack: false,
  canGoForward: false,
  loading: false,
  devToolsOpen: false,
  suspensionState: "active",
};

export function BrowserWorkspacePanel({
  sessionGroupId,
  browserId,
  initialUrl,
  embeddedApp = false,
  onTitleChange,
}: {
  sessionGroupId: string;
  browserId: string;
  initialUrl?: string;
  embeddedApp?: boolean;
  onTitleChange?: (browserId: string, title: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const addressEditingRef = useRef(false);
  const [state, setState] = useState<DesktopBrowserWorkspaceState>(EMPTY_BROWSER_STATE);
  const [inputValue, setInputValue] = useState("about:blank");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onTitleChange?.(browserId, state.title);
  }, [browserId, onTitleChange, state.title]);

  const syncBounds = useCallback(() => {
    const content = contentRef.current;
    if (!content || !window.trace) return;
    const rect = content.getBoundingClientRect();
    void window.trace.setBrowserBounds({
      sessionGroupId,
      browserId,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      },
    });
  }, [browserId, sessionGroupId]);

  useEffect(() => {
    if (!window.trace) return;
    let cancelled = false;
    const activate = async () => {
      let nextState = await window.trace!.activateBrowser({
        sessionGroupId,
        browserId,
        useAppSession: embeddedApp,
      });
      const navigationUrl = browserInitialNavigationUrl(nextState.url, initialUrl);
      if (navigationUrl) {
        nextState = await window.trace!.navigateBrowser({
          sessionGroupId,
          browserId,
          url: navigationUrl,
        });
      }
      return nextState;
    };
    void activate()
      .then((nextState) => {
        if (cancelled) return;
        setState(nextState);
        setInputValue(nextState.url);
        requestAnimationFrame(syncBounds);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Unable to open browser.");
      });
    const unsubscribe = window.trace.onBrowserWorkspaceState((nextState: unknown) => {
      if (
        !isBrowserState(nextState) ||
        nextState.sessionGroupId !== sessionGroupId ||
        nextState.browserId !== browserId
      )
        return;
      setState(nextState);
      if (!addressEditingRef.current) setInputValue(nextState.url);
    });
    const observer = new ResizeObserver(syncBounds);
    if (contentRef.current) observer.observe(contentRef.current);
    window.addEventListener("resize", syncBounds);
    window.visualViewport?.addEventListener("resize", syncBounds);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.visualViewport?.removeEventListener("resize", syncBounds);
      unsubscribe();
      void window.trace?.hideBrowser({ sessionGroupId, browserId });
    };
  }, [browserId, embeddedApp, initialUrl, sessionGroupId, syncBounds]);

  const perform = useCallback((action: () => Promise<DesktopBrowserWorkspaceState>) => {
    setError(null);
    void action()
      .then((nextState) => {
        setState(nextState);
        if (!addressEditingRef.current) setInputValue(nextState.url);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Browser action failed."),
      );
  }, []);

  if (!window.trace) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        The Trace browser is available in the desktop app.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-deep">
      {embeddedApp ? null : (
        <form
          className="app-region-drag flex shrink-0 items-center gap-2 border-b border-border bg-surface-mid px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            addressEditingRef.current = false;
            addressInputRef.current?.blur();
            perform(() =>
              window.trace!.navigateBrowser({ sessionGroupId, browserId, url: inputValue }),
            );
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="app-region-no-drag h-7 w-7"
            disabled={!state.canGoBack}
            onClick={() =>
              perform(() => window.trace!.goBrowserBack({ sessionGroupId, browserId }))
            }
            aria-label="Back"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="app-region-no-drag h-7 w-7"
            disabled={!state.canGoForward}
            onClick={() =>
              perform(() => window.trace!.goBrowserForward({ sessionGroupId, browserId }))
            }
            aria-label="Forward"
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="app-region-no-drag h-7 w-7"
            onClick={() =>
              perform(() => window.trace!.reloadBrowser({ sessionGroupId, browserId }))
            }
            aria-label="Reload"
          >
            {state.loading ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <RefreshCw size={15} />
            )}
          </Button>
          <Input
            ref={addressInputRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onFocus={() => {
              addressEditingRef.current = true;
            }}
            onBlur={() => {
              addressEditingRef.current = false;
              setInputValue(state.url);
            }}
            className="app-region-no-drag h-8 flex-1 bg-background/70 text-xs"
            aria-label="Browser URL"
            placeholder="Enter a URL"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "app-region-no-drag h-7 gap-1.5 text-xs",
              state.devToolsOpen && "bg-surface-hover text-foreground",
            )}
            onClick={() =>
              perform(() => window.trace!.toggleBrowserDevTools({ sessionGroupId, browserId }))
            }
          >
            <Code2 size={14} />
            DevTools
          </Button>
        </form>
      )}
      {error ? (
        <p className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div ref={contentRef} className="min-h-0 flex-1" aria-label={state.title} />
    </div>
  );
}

export function browserInitialNavigationUrl(currentUrl: string, initialUrl?: string) {
  return initialUrl && currentUrl === "about:blank" ? initialUrl : null;
}

function isBrowserState(value: unknown): value is DesktopBrowserWorkspaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.sessionGroupId === "string" &&
    typeof state.browserId === "string" &&
    typeof state.url === "string" &&
    typeof state.title === "string" &&
    typeof state.canGoBack === "boolean" &&
    typeof state.canGoForward === "boolean" &&
    typeof state.loading === "boolean" &&
    typeof state.devToolsOpen === "boolean" &&
    (state.suspensionState === "active" ||
      state.suspensionState === "frozen" ||
      state.suspensionState === "muted")
  );
}
