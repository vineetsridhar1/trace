import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface WebviewHandle {
  openDevTools: () => void;
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
}

interface ElectronWebview extends HTMLElement {
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  openDevTools: () => void;
}

// Electron's <webview> tag (enabled via webviewTag in the desktop shell).
// Unlike <iframe>, it is not subject to the target site's X-Frame-Options/CSP,
// so arbitrary external sites load. Created imperatively to avoid depending on
// ambient JSX typing for the custom element.
export const WebviewFrame = forwardRef<WebviewHandle, { url: string }>(function WebviewFrame(
  { url },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<ElectronWebview | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      openDevTools: () => webviewRef.current?.openDevTools(),
      reload: () => webviewRef.current?.reload(),
      goBack: () => webviewRef.current?.goBack(),
      goForward: () => webviewRef.current?.goForward(),
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = document.createElement("webview") as ElectronWebview;
    el.setAttribute("src", url);
    el.setAttribute("allowpopups", "true");
    // Fill the container without relying on the webview's default flex layout.
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    container.appendChild(el);
    webviewRef.current = el;
    return () => {
      el.remove();
      webviewRef.current = null;
    };
    // Created once on mount; navigation is handled by the effect below.
  }, []);

  useEffect(() => {
    const el = webviewRef.current;
    if (el && el.getAttribute("src") !== url) el.setAttribute("src", url);
  }, [url]);

  return <div ref={containerRef} className="absolute inset-0" />;
});
