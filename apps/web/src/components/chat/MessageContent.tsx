import DOMPurify from "dompurify";
import parse, { type HTMLReactParserOptions, type DOMNode, Element } from "html-react-parser";
import { UserMention } from "./UserMention";
import { SessionLinkCard } from "./SessionLinkCard";

// Allow mention data attributes through DOMPurify
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(DOMPurify as any).addHook(
  "uponSanitizeAttribute",
  (_node: unknown, data: { attrName: string; forceKeepAttr?: boolean }) => {
    if (data.attrName.startsWith("data-mention-")) {
      data.forceKeepAttr = true;
    }
  },
);

/** Match internal session URLs: /c/{channelId}/g/{groupId}/s/{sessionId} or /g/{groupId}/s/{sessionId} */
const SESSION_URL_RE = /(?:\/c\/([a-f0-9-]+))?\/g\/([a-f0-9-]+)\/s\/([a-f0-9-]+)\/?$/;

/** Match session URLs in plain text (not already inside an <a> tag) and wrap them */
const SESSION_URL_LINKIFY_RE =
  /(https?:\/\/[^\s<]+(?:\/c\/[a-f0-9-]+)?\/g\/[a-f0-9-]+\/s\/[a-f0-9-]+\/?)/g;

function parseSessionUrl(
  href: string | undefined,
): { channelId: string | null; sessionGroupId: string; sessionId: string } | null {
  if (!href) return null;
  // Handle both absolute (https://...) and relative (/c/...) URLs
  try {
    const pathname = href.startsWith("http") ? new URL(href).pathname : href;
    const match = pathname.match(SESSION_URL_RE);
    if (match) {
      return {
        channelId: match[1] ?? null,
        sessionGroupId: match[2],
        sessionId: match[3],
      };
    }
  } catch {
    // Invalid URL — ignore
  }
  return null;
}

const parserOptions: HTMLReactParserOptions = {
  replace: (domNode: DOMNode) => {
    if (!(domNode instanceof Element)) return undefined;

    // Mention spans
    if (domNode.name === "span" && domNode.attribs?.["data-mention-type"]) {
      const id = domNode.attribs["data-mention-id"];
      const name = domNode.attribs["data-mention-value"];

      if (domNode.attribs["data-mention-type"] === "user") {
        return <UserMention userId={id} fallbackName={name} />;
      }
    }

    // Session link cards — intercept <a> tags with session URLs
    if (domNode.name === "a") {
      const session = parseSessionUrl(domNode.attribs?.href);
      if (session) {
        return (
          <SessionLinkCard
            sessionId={session.sessionId}
            channelId={session.channelId}
            sessionGroupId={session.sessionGroupId}
          />
        );
      }
    }

    return undefined;
  },
};

/**
 * Wrap bare session URLs (not already inside <a> tags) in anchor elements
 * so the parser can detect them and render SessionLinkCard.
 */
function linkifySessionUrls(html: string): string {
  // Split on existing <a...>...</a> to avoid double-wrapping
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi);
  return parts
    .map((part, i) => {
      // Odd indices are the <a>...</a> segments — leave them alone
      if (i % 2 === 1) return part;
      return part.replace(SESSION_URL_LINKIFY_RE, (url) => `<a href="${url}">${url}</a>`);
    })
    .join("");
}

export function MessageContent({ html }: { html: string }) {
  // Strip empty paragraphs Quill appends and trailing <br> inside paragraphs
  const stripped = html
    .replace(/^(\s*<p>\s*<br\s*\/?>\s*<\/p>)+/i, "")
    .replace(/(<p>\s*<br\s*\/?>\s*<\/p>\s*)+$/i, "")
    .replace(/<br\s*\/?>\s*(<\/p>)/gi, "$1");
  const linked = linkifySessionUrls(stripped);
  const clean = DOMPurify.sanitize(linked);
  return (
    <div className="text-[15px] leading-snug text-foreground [&_p]:m-0">
      {parse(clean, parserOptions)}
    </div>
  );
}
