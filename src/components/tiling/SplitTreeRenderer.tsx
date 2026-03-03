import { useRef, useCallback, type RefObject } from 'react';
import type { LayoutNode, ViewMode } from '../../stores/panelLayoutStore';
import { PaneGroupRenderer } from './PaneGroupRenderer';
import { useSplitResize } from './useSplitResize';

interface SplitTreeRendererProps {
  node: LayoutNode;
  renderPaneContent: (mode: ViewMode, paneId: string) => React.ReactNode;
  singletonClaimRefs: Map<string, RefObject<HTMLDivElement | null>>;
}

export function SplitTreeRenderer({
  node,
  renderPaneContent,
  singletonClaimRefs,
}: SplitTreeRendererProps) {
  const { onMouseDown } = useSplitResize();

  if (node.type === 'pane') {
    return (
      <PaneGroupRenderer
        pane={node}
        renderPaneContent={renderPaneContent}
        singletonClaimRefs={singletonClaimRefs}
      />
    );
  }

  return (
    <SplitContainer
      node={node}
      renderPaneContent={renderPaneContent}
      singletonClaimRefs={singletonClaimRefs}
      onResizeMouseDown={onMouseDown}
    />
  );
}

// ─── Split container ─────────────────────────────────────────────

interface SplitContainerProps {
  node: LayoutNode & { type: 'split' };
  renderPaneContent: (mode: ViewMode, paneId: string) => React.ReactNode;
  singletonClaimRefs: Map<string, RefObject<HTMLDivElement | null>>;
  onResizeMouseDown: (
    e: React.MouseEvent,
    splitId: string,
    direction: 'horizontal' | 'vertical',
    containerEl: HTMLElement,
  ) => void;
}

function SplitContainer({
  node,
  renderPaneContent,
  singletonClaimRefs,
  onResizeMouseDown,
}: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (containerRef.current) {
        onResizeMouseDown(e, node.id, node.direction, containerRef.current);
      }
    },
    [node.id, node.direction, onResizeMouseDown],
  );

  const isHorizontal = node.direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 min-w-0 flex-1"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      <div
        style={{ flex: `${node.ratio} 1 0%` }}
        className="flex min-h-0 min-w-0"
      >
        <SplitTreeRenderer
          node={node.first}
          renderPaneContent={renderPaneContent}
          singletonClaimRefs={singletonClaimRefs}
        />
      </div>

      <div
        className={isHorizontal ? 'split-resize-handle-h' : 'split-resize-handle-v'}
        onMouseDown={handleMouseDown}
      />

      <div
        style={{ flex: `${1 - node.ratio} 1 0%` }}
        className="flex min-h-0 min-w-0"
      >
        <SplitTreeRenderer
          node={node.second}
          renderPaneContent={renderPaneContent}
          singletonClaimRefs={singletonClaimRefs}
        />
      </div>
    </div>
  );
}
