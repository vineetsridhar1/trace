import { useEffect, useRef } from "react";

// Electron's <webview> tag (enabled via webviewTag in the desktop shell).
// Unlike <iframe>, it is not subject to the target site's X-Frame-Options/CSP,
// so arbitrary external sites load. Created imperatively to avoid depending on
// ambient JSX typing for the custom element.
export function WebviewFrame({ url, reloadKey }: { url: string; reloadKey: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = document.createElement("webview");
    el.setAttribute("src", url);
    el.setAttribute("allowpopups", "true");
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "inline-flex";
    container.appendChild(el);
    webviewRef.current = el;
    return () => {
      el.remove();
      webviewRef.current = null;
    };
    // Created once on mount; navigation is handled by the effect below.
  }, []);

  useEffect(() => {
    webviewRef.current?.setAttribute("src", url);
  }, [url]);

  useEffect(() => {
    if (reloadKey === 0) return;
    const el = webviewRef.current as (HTMLElement & { reload?: () => void }) | null;
    el?.reload?.();
  }, [reloadKey]);

  return <div ref={containerRef} className="size-full" />;
}
