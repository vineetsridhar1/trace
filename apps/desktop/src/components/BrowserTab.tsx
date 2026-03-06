import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { FiArrowLeft, FiArrowRight, FiRefreshCw, FiAlertTriangle, FiSmartphone } from 'react-icons/fi';
import { useTerminalStore } from '../stores/terminalStore';

const MOBILE_WIDTH = 393;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: string;
        },
        HTMLElement
      >;
    }
  }
}

interface BrowserTabProps {
  workspaceId: string | null;
}

// ─── Single-workspace browser instance (kept alive via show/hide) ───

interface BrowserInstanceProps {
  workspaceId: string;
  isActive: boolean;
}

const BrowserInstance = memo(function BrowserInstance({ workspaceId, isActive }: BrowserInstanceProps) {
  const webviewRef = useRef<HTMLElement & {
    goBack: () => void;
    goForward: () => void;
    reload: () => void;
    loadURL: (url: string) => void;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
    getURL: () => string;
  }>(null);

  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [port, setPort] = useState<string | undefined>(undefined);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  // Subscribe to terminal store for port
  useEffect(() => {
    const update = () => {
      const env = useTerminalStore.getState().getEnvForWorkspace(workspaceId);
      setPort(env?.PORT);
    };

    update();
    const unsub = useTerminalStore.subscribe(update);
    return unsub;
  }, [workspaceId]);

  // Set default URL when port becomes available
  useEffect(() => {
    if (port && !url) {
      const defaultUrl = `http://localhost:${port}`;
      setUrl(defaultUrl);
      setInputUrl(defaultUrl);
    }
  }, [port, url]);

  // Webview event listeners
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onNavigate = () => {
      try {
        const currentUrl = wv.getURL();
        setUrl(currentUrl);
        setInputUrl(currentUrl);
        setCanGoBack(wv.canGoBack());
        setCanGoForward(wv.canGoForward());
        setLoadError(null);
      } catch {
        // webview not ready
      }
    };

    const onError = (e: Event) => {
      const detail = e as Event & { errorDescription?: string };
      const desc = detail.errorDescription || 'Failed to load page';
      // Ignore -3 (aborted) errors that happen during normal navigation
      if (desc === 'ERR_ABORTED') return;
      setLoadError(desc);
    };

    const onLoad = () => setLoadError(null);

    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);
    wv.addEventListener('did-fail-load', onError);
    wv.addEventListener('did-finish-load', onLoad);

    return () => {
      wv.removeEventListener('did-navigate', onNavigate);
      wv.removeEventListener('did-navigate-in-page', onNavigate);
      wv.removeEventListener('did-fail-load', onError);
      wv.removeEventListener('did-finish-load', onLoad);
    };
  }, [url]); // re-attach when url is first set (webview mounts)

  const navigate = useCallback((targetUrl: string) => {
    let normalized = targetUrl.trim();
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }
    if (!normalized) return;
    setUrl(normalized);
    setInputUrl(normalized);
    setLoadError(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigate(inputUrl);
    }
  }, [inputUrl, navigate]);

  if (!port) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden items-center justify-center"
        style={{ display: isActive ? 'flex' : 'none' }}
      >
        <span className="text-sm text-[#565f89]">Waiting for port allocation...</span>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {/* Navigation bar */}
      <div className="flex items-center gap-1.5 border-b border-[#292e42] px-2 py-1.5">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => webviewRef.current?.goBack()}
          className="flex h-6 w-6 items-center justify-center rounded text-[#565f89] hover:text-[#a9b1d6] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FiArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={!canGoForward}
          onClick={() => webviewRef.current?.goForward()}
          className="flex h-6 w-6 items-center justify-center rounded text-[#565f89] hover:text-[#a9b1d6] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FiArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => webviewRef.current?.reload()}
          className="flex h-6 w-6 items-center justify-center rounded text-[#565f89] hover:text-[#a9b1d6]"
        >
          <FiRefreshCw className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setIsMobileViewport((v) => !v)}
          title={isMobileViewport ? 'Switch to desktop viewport' : 'Switch to mobile viewport'}
          className={`flex h-6 w-6 items-center justify-center rounded ${
            isMobileViewport
              ? 'text-violet-400 bg-violet-500/10'
              : 'text-[#565f89] hover:text-[#a9b1d6]'
          }`}
        >
          <FiSmartphone className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded bg-[#1a1b26] border border-[#292e42] px-2 py-1 text-xs text-[#a9b1d6] outline-none focus:border-violet-500/50"
          placeholder="Enter URL..."
        />
      </div>

      {/* Content area */}
      <div className="relative flex-1 min-h-0 flex items-stretch justify-center">
        {loadError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#16161e]">
            <FiAlertTriangle className="h-8 w-8 text-[#565f89]" />
            <p className="text-sm text-[#565f89]">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                webviewRef.current?.reload();
              }}
              className="rounded bg-violet-500/20 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/30"
            >
              Retry
            </button>
          </div>
        )}
        {url && (
          <div
            style={{
              width: isMobileViewport ? `min(${MOBILE_WIDTH}px, 100%)` : '100%',
              transition: 'width 0.2s ease',
            }}
            className={isMobileViewport ? 'border-x border-[#292e42]' : ''}
          >
            <webview
              ref={webviewRef as React.RefObject<HTMLElement>}
              src={url}
              partition={`persist:browser-${workspaceId}`}
              allowpopups="true"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Container: manages per-workspace browser instances ───

export function BrowserTab({ workspaceId }: BrowserTabProps) {
  const [visitedIds, setVisitedIds] = useState<string[]>([]);

  useEffect(() => {
    if (workspaceId && !visitedIds.includes(workspaceId)) {
      setVisitedIds((prev) => [...prev, workspaceId]);
    }
  }, [workspaceId, visitedIds]);

  if (!workspaceId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[#565f89]">
        No workspace selected
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {visitedIds.map((wsId) => (
        <BrowserInstance
          key={wsId}
          workspaceId={wsId}
          isActive={wsId === workspaceId}
        />
      ))}
    </div>
  );
}
