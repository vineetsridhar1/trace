import { useMemo, useState } from "react";
import { Markdown } from "../ui/Markdown";
import { SteerableMarkdownBlock } from "../ui/SteerableMarkdownBlock";
import type { MarkdownSteerBlock, MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";
import { parsePlanMdx } from "./planMdxParser";
import { PlanVisualBlock } from "./PlanVisualBlock";

export function PlanMdx({
  content,
  steerable,
  comments,
  onAddComment,
  onRemoveComment,
}: {
  content: string;
  steerable: boolean;
  comments?: MarkdownSteerCommentsByBlock;
  onAddComment?: (block: MarkdownSteerBlock, text: string) => void;
  onRemoveComment?: (blockId: string, commentId: string) => void;
}) {
  const nodes = useMemo(() => parsePlanMdx(content), [content]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "markdown") {
          return <Markdown key={`markdown-${index}`}>{node.content}</Markdown>;
        }

        const block = {
          id: `visual-${index}-${node.name}`,
          markdown: node.source,
          type: node.name,
        };
        const visual = <PlanVisualBlock block={node} />;
        if (!steerable || !onAddComment || !onRemoveComment) {
          return <div key={block.id}>{visual}</div>;
        }

        return (
          <SteerableMarkdownBlock
            key={block.id}
            block={block}
            comments={comments?.[block.id] ?? []}
            active={activeBlockId === block.id}
            onOpen={setActiveBlockId}
            onCancel={() => setActiveBlockId(null)}
            onAdd={onAddComment}
            onRemove={onRemoveComment}
          >
            {visual}
          </SteerableMarkdownBlock>
        );
      })}
    </>
  );
}
