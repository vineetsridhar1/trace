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

const PLAN_LAYOUT_GUARDS = `<style id="trace-plan-layout-guards">
  *, *::before, *::after { box-sizing: border-box; min-width: 0; }
  html, body { max-width: 100%; overflow-x: clip; }
  p, li, dd, td, th, code, pre, summary, h1, h2, h3, h4, h5, h6 { overflow-wrap: anywhere; }
  table { width: 100%; table-layout: fixed; }
  pre { white-space: pre-wrap; }
  img, svg { max-width: 100%; }
</style>
<script>
  (() => {
    const fitSvgLabels = () => {
      document.querySelectorAll('svg text').forEach((label) => {
        if (label.childElementCount || !label.textContent?.trim()) return;
        const svg = label.ownerSVGElement;
        if (!svg) return;
        const labelBox = label.getBBox();
        const centerX = labelBox.x + labelBox.width / 2;
        const centerY = labelBox.y + labelBox.height / 2;
        const container = [...svg.querySelectorAll('rect')]
          .map((shape) => shape.getBBox())
          .filter((box) =>
            centerX >= box.x && centerX <= box.x + box.width && centerY >= box.y && centerY <= box.y + box.height,
          )
          .sort((left, right) => left.width * left.height - right.width * right.height)[0];
        if (!container) return;

        const availableWidth = container.width - 20;
        if (labelBox.width <= availableWidth) return;
        label.setAttribute('textLength', String(availableWidth));
        label.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fitSvgLabels, { once: true });
    } else {
      fitSvgLabels();
    }
  })();
</script>`;

/** Let a plan modify only its opaque-origin document; all other sandbox capabilities stay denied. */
export const PLAN_IFRAME_SANDBOX = "allow-scripts";

/** Defense in depth: the upload validator rejects network references, and the frame also forbids them. */
export function sandboxedPlanHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PLAN_CSP}">`;
  const headContents = `${policy}${PLAN_LAYOUT_GUARDS}`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}${headContents}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${headContents}</head>`);
  }
  return `<!doctype html><html><head>${headContents}</head><body>${html}</body></html>`;
}
