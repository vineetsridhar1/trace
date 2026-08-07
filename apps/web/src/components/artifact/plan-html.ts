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
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

/** Let a plan modify only its opaque-origin document; all other sandbox capabilities stay denied. */
export const PLAN_IFRAME_SANDBOX = "allow-scripts";

/** Defense in depth: the upload validator rejects network references, and the frame also forbids them. */
export function sandboxedPlanHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PLAN_CSP}">`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}${policy}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${policy}</head>`);
  }
  return `<!doctype html><html><head>${policy}</head><body>${html}</body></html>`;
}
