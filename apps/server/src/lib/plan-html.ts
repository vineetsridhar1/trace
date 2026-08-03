import { load } from "cheerio";
import { ValidationError } from "./errors.js";

const FORBIDDEN_TAGS = new Set(["script", "iframe", "embed", "object", "form"]);
const URL_ATTRIBUTES = new Set([
  "action",
  "background",
  "cite",
  "data",
  "formaction",
  "href",
  "longdesc",
  "manifest",
  "ping",
  "poster",
  "src",
  "srcset",
]);

function isInlineReference(reference: string): boolean {
  const normalized = reference.trim().toLowerCase();
  return normalized.startsWith("data:") || normalized.startsWith("#");
}

function validateCss(source: string): void {
  for (const match of source.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)) {
    if (!isInlineReference(match[1])) {
      throw new ValidationError(
        `plan.html must be self-contained; remove the external CSS asset ${match[1]}`,
      );
    }
  }
  if (/@import\s+(?:url\s*\(|["'])/i.test(source)) {
    throw new ValidationError("plan.html must be self-contained; remove the CSS @import");
  }
}

/**
 * A plan renders in a sandboxed frame with scripting disabled and no sibling files, so anything
 * it cannot carry inline would silently disappear at review time. Reject it at upload instead,
 * where the agent still gets a structured error it can act on.
 */
export function validatePlanHtml(source: string): void {
  const $ = load(source);
  $("*").each((_index, element) => {
    if (!("tagName" in element)) return;
    const tag = element.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      throw new ValidationError(`plan.html must not contain <${tag}>`);
    }
    if (tag === "meta" && $(element).attr("http-equiv")?.trim().toLowerCase() === "refresh") {
      throw new ValidationError("plan.html must not contain meta refresh navigation");
    }
    for (const [rawName, value] of Object.entries(element.attribs)) {
      const name = rawName.toLowerCase();
      if (name === "style") validateCss(value);
      if (name === "srcset") {
        throw new ValidationError("plan.html must not contain srcset; inline one image with src");
      }
      if ((URL_ATTRIBUTES.has(name) || name.endsWith(":href")) && !isInlineReference(value)) {
        throw new ValidationError(
          `plan.html must be self-contained; remove the external reference to ${value}`,
        );
      }
    }
  });
  $("style").each((_index, element) => validateCss($(element).html() ?? ""));
}
