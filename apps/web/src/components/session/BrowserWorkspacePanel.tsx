import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAttachedCheckoutForGroup, useDesktopBridgeInfo } from "../../stores/bridges";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { BROWSER_ADDRESS_FOCUS_EVENT } from "./browser-address-focus";

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
  sessionHosting,
  onTitleChange,
}: {
  sessionGroupId: string;
  browserId: string;
  initialUrl?: string;
  sessionHosting?: string;
  onTitleChange?: (browserId: string, title: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const addressEditingRef = useRef(false);
  const [state, setState] = useState<DesktopBrowserWorkspaceState>(EMPTY_BROWSER_STATE);
  const [inputValue, setInputValue] = useState("about:blank");
  const [error, setError] = useState<string | null>(null);
  const attachedCheckout = useAttachedCheckoutForGroup(sessionGroupId);
  const desktopBridgeInfo = useDesktopBridgeInfo();
  const syncIndicator = getBrowserSyncIndicator(
    sessionHosting,
    attachedCheckout?.bridgeInstanceId ?? null,
    desktopBridgeInfo?.instanceId,
  );

  useEffect(() => {
    const handleFocusAddress = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail !== browserId) return;
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    };
    window.addEventListener(BROWSER_ADDRESS_FOCUS_EVENT, handleFocusAddress);
    return () => window.removeEventListener(BROWSER_ADDRESS_FOCUS_EVENT, handleFocusAddress);
  }, [browserId]);

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
    void window.trace
      .activateBrowser({ sessionGroupId, browserId })
      .then(async (nextState) => {
        if (cancelled) return;
        if (initialUrl && nextState.url === "about:blank") {
          nextState = await window.trace!.navigateBrowser({
            sessionGroupId,
            browserId,
            url: initialUrl,
          });
        }
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
  }, [browserId, initialUrl, sessionGroupId, syncBounds]);

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

  // The embedded browser is an Electron surface. On the web the request still
  // reaches this tab, so show what was asked for and let the user open it
  // rather than dropping it silently.
  if (!window.trace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          The embedded browser is available in the Trace desktop app.
        </p>
        {initialUrl ? (
          <a
            href={initialUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="max-w-full truncate text-sm font-medium text-accent underline underline-offset-4"
          >
            Open {initialUrl} in a new tab
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-deep">
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
          onClick={() => perform(() => window.trace!.goBrowserBack({ sessionGroupId, browserId }))}
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
          onClick={() => perform(() => window.trace!.reloadBrowser({ sessionGroupId, browserId }))}
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
        <span
          className="app-region-no-drag flex h-7 items-center gap-1.5 px-1.5 text-xs text-muted-foreground"
          title={syncIndicator.label}
          aria-label={syncIndicator.label}
        >
          <span className={cn("h-2 w-2 rounded-full", syncIndicator.color)} />
          Sync
        </span>
      </form>
      {error ? (
        <p className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div ref={contentRef} className="min-h-0 flex-1" aria-label={state.title} />
    </div>
  );
}

type BranchSyncStatus = "checking" | "synced" | "behind" | "outOfSync";

export function getBrowserSyncIndicator(
  sessionHosting: string | undefined,
  attachedBridgeInstanceId: string | null,
  desktopBridgeInstanceId: string | null | undefined,
) {
  if (sessionHosting === "cloud") {
    return { color: "bg-emerald-500", label: "Cloud sessions are always synced." };
  }

  const status = getBranchSyncStatus(attachedBridgeInstanceId, desktopBridgeInstanceId);
  return { color: branchSyncStatusColor(status), label: branchSyncStatusLabel(status) };
}

export function getBranchSyncStatus(
  attachedBridgeInstanceId: string | null,
  desktopBridgeInstanceId: string | null | undefined,
): BranchSyncStatus {
  if (desktopBridgeInstanceId === undefined) return "checking";
  if (!attachedBridgeInstanceId) return "outOfSync";
  return attachedBridgeInstanceId === desktopBridgeInstanceId ? "synced" : "behind";
}

function branchSyncStatusColor(status: BranchSyncStatus) {
  if (status === "synced") return "bg-emerald-500";
  if (status === "behind") return "bg-amber-400";
  if (status === "outOfSync") return "bg-destructive";
  return "bg-muted-foreground";
}

function branchSyncStatusLabel(status: BranchSyncStatus) {
  switch (status) {
    case "synced":
      return "Branch is spotlighted and synced";
    case "behind":
      return "Branch is spotlighted on another bridge. Press Spotlight to sync it here.";
    case "outOfSync":
      return "Branch is not spotlighted. Press Spotlight to sync this branch.";
    case "checking":
      return "Checking branch sync status";
  }
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
