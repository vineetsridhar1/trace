export interface MarkdownSteerBlock {
  id: string;
  markdown: string;
  type: string;
}

export interface MarkdownSteerComment extends MarkdownSteerBlock {
  commentId: string;
  text: string;
}

export type MarkdownSteerCommentsByBlock = Record<string, MarkdownSteerComment[]>;

interface HastPoint {
  offset?: number;
}

interface HastPosition {
  start?: HastPoint;
  end?: HastPoint;
}

interface HastNode {
  type?: string;
  value?: string;
  position?: HastPosition;
  children?: HastNode[];
}

interface HastElement extends HastNode {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

interface HastRoot extends HastNode {
  type: "root";
  children: HastNode[];
}

const STEERABLE_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
  "hr",
]);

function isHastRoot(node: unknown): node is HastRoot {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    (node as { type?: unknown }).type === "root" &&
    "children" in node &&
    Array.isArray((node as { children?: unknown }).children)
  );
}

function isHastElement(node: HastNode): node is HastElement {
  return node.type === "element" && typeof (node as { tagName?: unknown }).tagName === "string";
}

function getNodeText(node: HastNode): string {
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(getNodeText).join("");
}

function getNodeMarkdown(node: HastNode, markdown: string): string {
  const startOffset = node.position?.start?.offset;
  const endOffset = node.position?.end?.offset;

  if (
    typeof startOffset === "number" &&
    typeof endOffset === "number" &&
    startOffset >= 0 &&
    endOffset <= markdown.length &&
    startOffset < endOffset
  ) {
    return markdown.slice(startOffset, endOffset).trim();
  }

  return getNodeText(node).trim();
}

export function createSteerableBlocksPlugin(markdown: string) {
  return function rehypeSteerableBlocks() {
    return function transform(tree: unknown) {
      if (!isHastRoot(tree)) return;

      tree.children = tree.children.map((child, index) => {
        if (!isHastElement(child) || !STEERABLE_TAGS.has(child.tagName)) {
          return child;
        }

        const blockMarkdown = getNodeMarkdown(child, markdown);
        if (!blockMarkdown) return child;

        return {
          type: "element",
          tagName: "div",
          properties: {
            "data-steer-block-id": `${index}-${child.tagName}`,
            "data-steer-block-markdown": blockMarkdown,
            "data-steer-block-type": child.tagName,
          },
          children: [child],
          position: child.position,
        } satisfies HastElement;
      });
    };
  };
}
