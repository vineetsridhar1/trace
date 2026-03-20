import parse, { type HTMLReactParserOptions, type DOMNode, Element } from "html-react-parser";
import { UserMention } from "./UserMention";

const parserOptions: HTMLReactParserOptions = {
  replace: (domNode: DOMNode) => {
    if (
      domNode instanceof Element &&
      domNode.name === "span" &&
      domNode.attribs?.["data-mention-type"]
    ) {
      const id = domNode.attribs["data-mention-id"];
      const name = domNode.attribs["data-mention-value"];

      if (domNode.attribs["data-mention-type"] === "user") {
        return <UserMention userId={id} fallbackName={name} />;
      }
    }
    return undefined;
  },
};

export function MessageContent({ html }: { html: string }) {
  // Strip trailing empty paragraphs Quill always appends
  const clean = html.replace(/(<p>\s*<br\s*\/?>\s*<\/p>\s*)+$/i, "");
  return (
    <div className="text-[15px] leading-snug text-foreground [&_p]:m-0">
      {parse(clean, parserOptions)}
    </div>
  );
}
