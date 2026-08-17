import TurndownService from "turndown";
import { gfm } from "@truto/turndown-plugin-gfm";

const planTurndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});
planTurndown.use(gfm);
planTurndown.remove(["style", "script"]);

/** Convert the visual plan to compact Markdown before handing it to the implementing agent. */
export function planMarkdownForImplementation(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return planTurndown.turndown(body ? body[1] : html).trim();
}

const PLAN_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'";

const PLAN_SCROLL_GUARD = "<style>html,body{overscroll-behavior:contain}</style>";

/** Plans are static documents: no sandbox capability is granted. */
export const PLAN_IFRAME_SANDBOX = "";

/** Defense in depth: the upload validator rejects network references, and the frame also forbids them. */
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
