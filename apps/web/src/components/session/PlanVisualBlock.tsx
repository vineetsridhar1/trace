import {
  AlertTriangle,
  ArrowRight,
  CheckSquare2,
  CircleHelp,
  Code2,
  Files,
  GitBranch,
  Info,
  Layers3,
  Lightbulb,
} from "lucide-react";
import type { ReactNode } from "react";
import { Markdown } from "../ui/Markdown";
import { cn } from "@/lib/utils";
import { parsePlanDiagram, type PlanMdxBlockNode } from "./planMdxParser";

const iconByName: Record<PlanMdxBlockNode["name"], ReactNode> = {
  Callout: <Lightbulb size={15} />,
  Diagram: <GitBranch size={15} />,
  FileTree: <Files size={15} />,
  Checklist: <CheckSquare2 size={15} />,
  QuestionForm: <CircleHelp size={15} />,
  Code: <Code2 size={15} />,
  Tabs: <Layers3 size={15} />,
};

function DiagramContent({ content }: { content: string }) {
  const edges = parsePlanDiagram(content);
  if (edges.length === 0) return <Markdown>{content}</Markdown>;

  return (
    <div className="grid gap-2">
      {edges.map((edge, index) => (
        <div
          key={`${edge.source}-${edge.target}-${index}`}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3"
        >
          <div className="rounded-md border border-border bg-surface-deep px-3 py-2 text-sm font-medium">
            {edge.source}
          </div>
          <div className="flex min-w-20 flex-col items-center gap-0.5 text-muted-foreground">
            {edge.label ? (
              <span className="max-w-36 truncate text-[10px]">{edge.label}</span>
            ) : null}
            <ArrowRight size={16} />
          </div>
          <div className="rounded-md border border-border bg-surface-deep px-3 py-2 text-sm font-medium">
            {edge.target}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlanVisualBlock({ block }: { block: PlanMdxBlockNode }) {
  const isWarning = block.tone === "warning" || block.tone === "risk";
  const isDecision = block.tone === "decision";

  return (
    <section
      className={cn(
        "my-5 overflow-hidden rounded-lg border border-border bg-surface",
        isWarning && "border-amber-500/40",
        isDecision && "border-accent/40",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 border-b border-border bg-surface-deep px-4 py-2.5 text-xs font-semibold",
          isWarning && "text-amber-400",
          isDecision && "text-accent",
        )}
      >
        {isWarning ? <AlertTriangle size={15} /> : iconByName[block.name] ?? <Info size={15} />}
        <span>{block.title}</span>
        <span className="ml-auto font-mono text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
          {block.name}
        </span>
      </header>
      <div className="p-4">
        {block.name === "Diagram" ? <DiagramContent content={block.content} /> : null}
        {block.name === "FileTree" ? (
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-foreground">
            {block.content}
          </pre>
        ) : null}
        {block.name === "Code" ? (
          <pre className="overflow-x-auto rounded-md bg-surface-deep p-3 font-mono text-xs leading-5 text-foreground">
            <code data-language={block.language}>{block.content}</code>
          </pre>
        ) : null}
        {block.name !== "Diagram" && block.name !== "FileTree" && block.name !== "Code" ? (
          <Markdown>{block.content}</Markdown>
        ) : null}
      </div>
    </section>
  );
}
