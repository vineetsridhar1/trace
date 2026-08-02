export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Approving a plan hands its content to the implementing agent. A plan is a styled HTML page, and
 * its <style> block is the bulk of the bytes and none of the meaning — strip the presentation and
 * keep the markup, whose semantic classes still tell the model what each block is.
 */
export function planMarkupForImplementation(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return (body ? body[1] : html)
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PLAN_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

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
