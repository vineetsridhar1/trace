import { useMemo, useState } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesignEditorDomNode } from "../../../stores/design-editor";

type TreeRow = { node: DesignEditorDomNode; depth: number; key: string };

export function DesignEditorDomTree({
  nodes,
  selectedElementId,
  onSelect,
  onHover,
}: {
  nodes: DesignEditorDomNode[];
  selectedElementId: string | null;
  onSelect: (elementId: string) => void;
  onHover: (elementId: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => flattenTree(nodes, collapsed), [collapsed, nodes]);
  const toggle = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="max-h-48 shrink-0 overflow-y-auto border-b border-border bg-muted/10 px-2 py-2">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <Code2 className="size-3" />
        DOM
      </div>
      {rows.map(({ node, depth, key }) => {
        const active = node.elementId === selectedElementId;
        const hasChildren = node.children.length > 0;
        const isCollapsed = collapsed.has(key);
        return (
          <div
            key={key}
            className={cn(
              "flex h-7 items-center rounded-md pr-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
            style={{ paddingLeft: `${Math.min(depth, 8) * 14 + 2}px` }}
            onPointerEnter={() => node.elementId && onHover(node.elementId)}
            onPointerLeave={() => node.elementId && onHover(null)}
          >
            <button
              type="button"
              aria-label={isCollapsed ? "Expand element" : "Collapse element"}
              disabled={!hasChildren}
              className="flex size-5 shrink-0 items-center justify-center disabled:pointer-events-none"
              onClick={() => toggle(key)}
            >
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  isCollapsed && "-rotate-90",
                  !hasChildren && "opacity-0",
                )}
              />
            </button>
            <button
              type="button"
              disabled={!node.elementId}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:pointer-events-none"
              onClick={() => node.elementId && onSelect(node.elementId)}
            >
              <span className="size-3 shrink-0 rounded-[2px] border border-dashed border-muted-foreground/45" />
              <span className="min-w-0 flex-1 truncate">{node.label}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
                {node.elementName}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function flattenTree(
  nodes: DesignEditorDomNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
  parentKey = "root",
): TreeRow[] {
  return nodes.flatMap((node, index) => {
    const key = `${parentKey}.${node.elementId ?? node.elementName}.${index}`;
    const row = { node, depth, key };
    return collapsed.has(key)
      ? [row]
      : [row, ...flattenTree(node.children, collapsed, depth + 1, key)];
  });
}
