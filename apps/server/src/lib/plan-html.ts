import { ValidationError } from "./errors.js";

const ASSET_TAG =
  /<(?:script|link|img|source|video|audio|use|image|iframe|embed|object)\b[^>]*(?:src|href|data)=["']([^"']+)["'][^>]*>/gi;
const CSS_URL = /url\(\s*["']?(?!data:)([^)'"\s]+)["']?\s*\)/gi;

/**
 * A plan renders in a sandboxed frame with scripting disabled and no sibling files, so anything
 * it cannot carry inline would silently disappear at review time. Reject it at upload instead,
 * where the agent still gets a structured error it can act on.
 */
export function validatePlanHtml(source: string): void {
  // Comments never render or load anything, and plans legitimately describe these rules in prose.
  const html = source.replace(/<!--[\s\S]*?-->/g, "");
  if (/<script\b/i.test(html)) {
    throw new ValidationError(
      "plan.html must not contain <script>; plans render without scripting",
    );
  }
  for (const match of html.matchAll(ASSET_TAG)) {
    const reference = match[1];
    if (!reference.startsWith("data:") && !reference.startsWith("#")) {
      throw new ValidationError(
        `plan.html must be self-contained; remove the external reference to ${reference}`,
      );
    }
  }
  const cssUrl = CSS_URL.exec(html);
  if (cssUrl) {
    throw new ValidationError(
      `plan.html must be self-contained; remove the external CSS asset ${cssUrl[1]}`,
    );
  }
  if (/@import\s+(?:url\s*\(|["'])/i.test(html)) {
    throw new ValidationError("plan.html must be self-contained; remove the CSS @import");
  }
}
