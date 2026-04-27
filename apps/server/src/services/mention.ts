import sanitize from "sanitize-html";
import { load } from "cheerio";

export interface ExtractedMention {
  userId: string;
  name: string;
}

const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["class", "data-mention-id", "data-mention-value", "data-mention-type"],
  },
  allowedClasses: {
    span: ["mention"],
  },
};

/** Sanitize HTML to a safe allowlist of tags + mention data attributes */
export function sanitizeHtml(html: string): string {
  let clean = sanitize(html, SANITIZE_OPTIONS);
  // Quill always appends a trailing <p><br></p> — strip it
  clean = clean.replace(/(<p>\s*<br\s*\/?>\s*<\/p>\s*)+$/i, "");
  return clean;
}

/** Extract mention metadata from HTML mention spans */
export function extractMentions(html: string): ExtractedMention[] {
  const $ = load(html);
  const mentions: ExtractedMention[] = [];
  const seen = new Set<string>();

  $("span.mention[data-mention-id]").each((_i, el) => {
    const userId = $(el).attr("data-mention-id");
    const name = $(el).attr("data-mention-value") ?? $(el).text().replace(/^@/, "");
    if (userId && !seen.has(userId)) {
      seen.add(userId);
      mentions.push({ userId, name });
    }
  });

  return mentions;
}

/** Strip HTML to plain text for previews and backward compat */
export function stripHtml(html: string): string {
  const $ = load(html);
  // Replace mention spans with @name for readable plain text
  $("span.mention").each((_i, el) => {
    const name = $(el).attr("data-mention-value") ?? $(el).text();
    $(el).replaceWith(name.startsWith("@") ? name : `@${name}`);
  });
  // Replace <br> and block elements with newlines
  $("br").replaceWith("\n");
  $("p").each((_i, el) => {
    $(el).append("\n");
  });
  return $.text()
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
