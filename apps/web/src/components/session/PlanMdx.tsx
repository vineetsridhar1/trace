import {
  BlockRegistryProvider,
  type BlockRenderContext,
} from "@agent-native/core/blocks";
import "@agent-native/core/styles/agent-native.css";
import { useMemo, useState } from "react";
import { Markdown } from "../ui/Markdown";
import { SteerableMarkdownBlock } from "../ui/SteerableMarkdownBlock";
import type { MarkdownSteerBlock, MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";
import { parsePlanMdx, planBlockRegistry } from "./planMdxParser";
import {
  createPlanBlockRenderContext,
  PlanRegistryBlock,
  PlanUnknownBlock,
} from "./PlanVisualBlock";

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
  const context = useMemo<BlockRenderContext>(() => createPlanBlockRenderContext(), []);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  return (
    <BlockRegistryProvider registry={planBlockRegistry} ctx={context}>
      {nodes.map((node, index) => {
        if (node.type === "markdown") {
          return <Markdown key={`markdown-${index}`}>{node.content}</Markdown>;
        }

        const block = {
          id: `visual-${node.id}`,
          markdown: node.source,
          type: node.type === "registry-block" ? node.blockType : node.name,
        };
        const visual =
          node.type === "registry-block" ? (
            <PlanRegistryBlock block={node} context={context} />
          ) : (
            <PlanUnknownBlock block={node} />
          );
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
    </BlockRegistryProvider>
  );
}
