import DOMPurify from "dompurify";
import parse, { type HTMLReactParserOptions, type DOMNode, Element } from "html-react-parser";
import { UserMention } from "./UserMention";
import { SessionLinkCard } from "./SessionLinkCard";

// Allow mention data attributes through DOMPurify
DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName.startsWith("data-mention-")) {
    data.forceKeepAttr = true;
  }
});

/** Match internal session URLs: /c/{channelId}/s/{sessionId} */
const SESSION_URL_RE = /\/c\/([a-f0-9-]+)\/s\/([a-f0-9-]+)\/?$/;

function parseSessionUrl(href: string | undefined): { channelId: string; sessionId: string } | null {
  if (!href) return null;
  // Handle both absolute (https://...) and relative (/c/...) URLs
  try {
    const pathname = href.startsWith("http") ? new URL(href).pathname : href;
    const match = pathname.match(SESSION_URL_RE);
    if (match) return { channelId: match[1], sessionId: match[2] };
  } catch {
    // Invalid URL — ignore
  }
  return null;
}

const parserOptions: HTMLReactParserOptions = {
  replace: (domNode: DOMNode) => {
    if (!(domNode instanceof Element)) return undefined;

    // Mention spans
    if (
      domNode.name === "span" &&
      domNode.attribs?.["data-mention-type"]
    ) {
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
          />
        );
      }
    }

    return undefined;
  },
};

export function MessageContent({ html }: { html: string }) {
  // Strip trailing empty paragraphs Quill always appends
  const stripped = html.replace(/(<p>\s*<br\s*\/?>\s*<\/p>\s*)+$/i, "");
  const clean = DOMPurify.sanitize(stripped);
  return (
    <div className="text-[15px] leading-snug text-foreground [&_p]:m-0">
      {parse(clean, parserOptions)}
    </div>
  );
}
