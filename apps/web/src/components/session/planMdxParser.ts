import {
  attributeValue,
  BlockRegistry,
  parseSpecBlock,
  registerLibraryBlocks,
  type MdxAttrNode,
  type MdxJsxNode,
} from "@agent-native/core/blocks";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

interface Point {
  offset?: number;
}

interface Position {
  start?: Point;
  end?: Point;
}

interface AstNode {
  type?: string;
  name?: string | null;
  attributes?: MdxAttrNode[];
  children?: AstNode[];
  position?: Position;
}

export interface PlanMarkdownNode {
  type: "markdown";
  content: string;
}

export interface PlanRegistryBlockNode {
  type: "registry-block";
  id: string;
  blockType: string;
  title?: string;
  summary?: string;
  data: unknown;
  source: string;
}

export interface PlanUnknownBlockNode {
  type: "unknown-block";
  id: string;
  name: string;
  content: string;
  source: string;
}

export type PlanMdxNode = PlanMarkdownNode | PlanRegistryBlockNode | PlanUnknownBlockNode;

export const planBlockRegistry = new BlockRegistry();
registerLibraryBlocks(planBlockRegistry);

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function childrenSource(content: string, node: AstNode): string {
  const children = node.children ?? [];
  if (children.length === 0) return "";
  const start = children[0].position?.start?.offset;
  const end = children.at(-1)?.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return "";
  return content.slice(start, end).trim();
}

function getAttribute(node: AstNode, name: string): unknown {
  const attribute = node.attributes?.find((candidate) => candidate.name === name);
  return attributeValue(attribute);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parsePlanMdx(rawContent: string): PlanMdxNode[] {
  const content = stripFrontmatter(rawContent);
  const tree = unified().use(remarkParse).use(remarkMdx).parse(content) as AstNode;
  const nodes: PlanMdxNode[] = [];
  let cursor = 0;

  for (const [index, child] of (tree.children ?? []).entries()) {
    if (child.type !== "mdxJsxFlowElement" || !child.name) continue;
    const start = child.position?.start?.offset;
    const end = child.position?.end?.offset;
    if (typeof start !== "number" || typeof end !== "number") continue;

    const markdown = content.slice(cursor, start).trim();
    if (markdown) nodes.push({ type: "markdown", content: markdown });

    const source = content.slice(start, end);
    const body = childrenSource(content, child);
    if (child.name === "RichText") {
      if (body) nodes.push({ type: "markdown", content: body });
      cursor = end;
      continue;
    }

    const id = asOptionalString(getAttribute(child, "id")) ?? `plan-block-${index}`;
    const title = asOptionalString(getAttribute(child, "title"));
    const summary = asOptionalString(getAttribute(child, "summary"));
    const parsed = parseSpecBlock(
      planBlockRegistry,
      child as MdxJsxNode,
      { id, title, summary },
      body,
      id,
    );

    if (parsed) {
      nodes.push({
        type: "registry-block",
        id,
        blockType: parsed.type,
        title,
        summary,
        data: parsed.data,
        source,
      });
    } else {
      nodes.push({
        type: "unknown-block",
        id,
        name: child.name,
        content: body,
        source,
      });
    }
    cursor = end;
  }

  const trailingMarkdown = content.slice(cursor).trim();
  if (trailingMarkdown) nodes.push({ type: "markdown", content: trailingMarkdown });
  return nodes;
}
