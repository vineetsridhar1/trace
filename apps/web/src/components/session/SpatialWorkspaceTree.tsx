import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { getSpatialAxisSpan, type SpatialNode } from "./spatial-workspace-layout";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";
import { SpatialRegion } from "./SpatialRegion";
import { SpatialResizeHandle } from "./SpatialResizeHandle";

interface SpatialWorkspaceTreeProps {
  node: SpatialNode;
  tabById: Map<string, SpatialWorkspaceTab>;
  compact: boolean;
  dragging: boolean;
  focusedMode: boolean;
  resizing: boolean;
  onActivate: (groupId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onFocusPanel: (groupId: string) => void;
  onNewTab: (groupId: string) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onResizeStart: (splitId: string) => void;
  onResizeEnd: () => void;
  onTogglePanelFocus: (groupId: string) => void;
  renderTab: (tabId: string, compact: boolean) => ReactNode;
}

export function SpatialWorkspaceTree(props: SpatialWorkspaceTreeProps) {
  const { node } = props;
  if (node.type === "group") {
    return (
      <SpatialRegion
        group={node}
        tabById={props.tabById}
        compact={props.compact}
        dragging={props.dragging}
        focusedMode={props.focusedMode}
        onActivate={props.onActivate}
        onCloseTab={props.onCloseTab}
        onFocusPanel={props.onFocusPanel}
        onNewTab={props.onNewTab}
        onTogglePanelFocus={props.onTogglePanelFocus}
        renderTab={props.renderTab}
      />
    );
  }

  const firstSpan = getSpatialAxisSpan(node.children[0], node.direction);
  const secondSpan = getSpatialAxisSpan(node.children[1], node.direction);
  const ratio = node.ratio ?? firstSpan / (firstSpan + secondSpan);

  return (
    <div
      className={cn(
        "relative grid min-h-0 min-w-0 flex-1 gap-px bg-border",
        !props.resizing && "transition-[grid-template-columns,grid-template-rows] duration-200 ease-out",
      )}
      style={
        node.direction === "horizontal"
          ? { gridTemplateColumns: `minmax(0, ${ratio}fr) minmax(0, ${1 - ratio}fr)` }
          : { gridTemplateRows: `minmax(0, ${ratio}fr) minmax(0, ${1 - ratio}fr)` }
      }
    >
      {node.children.map((child) => (
        <SpatialWorkspaceTree key={child.id} {...props} node={child} />
      ))}
      <SpatialResizeHandle
        splitId={node.id}
        direction={node.direction}
        ratio={ratio}
        onResize={props.onResizeSplit}
        onResizeStart={props.onResizeStart}
        onResizeEnd={props.onResizeEnd}
      />
    </div>
  );
}

