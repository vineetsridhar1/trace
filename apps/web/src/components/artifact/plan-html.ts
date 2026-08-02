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
