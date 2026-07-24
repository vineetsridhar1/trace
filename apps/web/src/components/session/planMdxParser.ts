export const PLAN_MDX_BLOCK_NAMES = [
  "Callout",
  "Diagram",
  "FileTree",
  "Checklist",
  "QuestionForm",
  "Code",
  "Tabs",
] as const;

export type PlanMdxBlockName = (typeof PLAN_MDX_BLOCK_NAMES)[number];

export interface PlanMdxMarkdownNode {
  type: "markdown";
  content: string;
}

export interface PlanMdxBlockNode {
  type: "block";
  name: PlanMdxBlockName;
  title: string;
  tone?: string;
  language?: string;
  content: string;
  source: string;
}

export type PlanMdxNode = PlanMdxMarkdownNode | PlanMdxBlockNode;

const BLOCK_PATTERN = new RegExp(
  `<(${PLAN_MDX_BLOCK_NAMES.join("|")})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`,
  "g",
);
const ATTRIBUTE_PATTERN = /\b([a-zA-Z][\w-]*)="([^"]*)"/g;

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

export function parsePlanMdx(content: string): PlanMdxNode[] {
  const nodes: PlanMdxNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(BLOCK_PATTERN)) {
    const index = match.index;
    if (index > cursor) {
      const markdown = content.slice(cursor, index).trim();
      if (markdown) nodes.push({ type: "markdown", content: markdown });
    }

    const attributes = parseAttributes(match[2]);
    nodes.push({
      type: "block",
      name: match[1] as PlanMdxBlockName,
      title: attributes.title || match[1],
      tone: attributes.tone,
      language: attributes.language,
      content: match[3].trim(),
      source: match[0],
    });
    cursor = index + match[0].length;
  }

  const trailingMarkdown = content.slice(cursor).trim();
  if (trailingMarkdown) nodes.push({ type: "markdown", content: trailingMarkdown });
  return nodes;
}

export interface PlanDiagramEdge {
  source: string;
  target: string;
  label?: string;
}

export function parsePlanDiagram(content: string): PlanDiagramEdge[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(.+?)\s*->\s*([^:]+?)(?:\s*:\s*(.+))?$/);
      if (!match) return [];
      return [{ source: match[1].trim(), target: match[2].trim(), label: match[3]?.trim() }];
    });
}
