const PLAN_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'";

const PLAN_SCROLL_GUARD = "<style>html,body{overscroll-behavior:contain}</style>";

/** Wrap an agent-authored plan in the same restrictive policy as the web viewer. */
export function sandboxedPlanHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PLAN_CSP}">`;
  const headContents = `${policy}${PLAN_SCROLL_GUARD}`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}${headContents}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${headContents}</head>`);
  }
  return `<!doctype html><html><head>${headContents}</head><body>${html}</body></html>`;
}

/** The in-memory document is the only navigation a visual plan may initiate. */
export function isPlanNavigationAllowed(url: string): boolean {
  return url === "about:blank";
}
