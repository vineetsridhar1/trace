import {
  BlockView,
  type BlockRenderContext,
  type BlockSpec,
} from "@agent-native/core/blocks";
import DOMPurify from "dompurify";
import { Box } from "lucide-react";
import { Markdown } from "../ui/Markdown";
import {
  planBlockRegistry,
  type PlanRegistryBlockNode,
  type PlanUnknownBlockNode,
} from "./planMdxParser";

export function createPlanBlockRenderContext(): BlockRenderContext {
  const context: BlockRenderContext = {
    dialect: "gfm",
    visualFrame: "show",
    sanitizeHtml: (html) => DOMPurify.sanitize(html),
    renderMarkdown: (markdown) => <Markdown>{markdown}</Markdown>,
    renderBlock: ({ block }) => {
      if (
        typeof block !== "object" ||
        block === null ||
        !("type" in block) ||
        typeof block.type !== "string" ||
        !("id" in block) ||
        typeof block.id !== "string"
      ) {
        return null;
      }
      const spec = planBlockRegistry.get(block.type);
      if (!spec) return null;
      return (
        <BlockView
          spec={spec}
          block={{
            id: block.id,
            title: "title" in block && typeof block.title === "string" ? block.title : undefined,
            summary:
              "summary" in block && typeof block.summary === "string" ? block.summary : undefined,
            data: "data" in block ? block.data : {},
          }}
          editing={false}
          editable={false}
          ctx={context}
        />
      );
    },
  };
  return context;
}

export function PlanRegistryBlock({
  block,
  context,
}: {
  block: PlanRegistryBlockNode;
  context: BlockRenderContext;
}) {
  const spec = planBlockRegistry.get(block.blockType) as BlockSpec<unknown> | undefined;
  if (!spec) return null;

  return (
    <BlockView
      spec={spec}
      block={{
        id: block.id,
        title: block.title,
        summary: block.summary,
        data: block.data,
      }}
      editing={false}
      editable={false}
      ctx={context}
    />
  );
}

export function PlanUnknownBlock({ block }: { block: PlanUnknownBlockNode }) {
  return (
    <section className="my-5 overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border bg-surface-deep px-4 py-2.5 text-xs font-semibold text-muted-foreground">
        <Box size={15} />
        <span>{block.name}</span>
      </header>
      <div className="p-4">
        {block.content ? <Markdown>{block.content}</Markdown> : null}
      </div>
    </section>
  );
}
