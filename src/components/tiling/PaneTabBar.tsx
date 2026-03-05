import { useCallback, useEffect, useState } from 'react';
import { usePanelLayoutStore, type PaneGroup, type ViewMode } from '../../stores/panelLayoutStore';

const TAB_LABELS: Record<ViewMode, string> = {
  agent: 'Agent',
  ticket: 'Ticket',
  files: 'Files',
  terminal: 'Terminal',
  browser: 'Browser',
};

type DropEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

interface PaneTabBarProps {
  pane: PaneGroup;
}

interface DragPayload {
  tab: ViewMode;
  sourcePaneId: string;
}

export function PaneTabBar({ pane }: PaneTabBarProps) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, tab: ViewMode) => {
      e.dataTransfer.setData('application/pane-tab', JSON.stringify({ tab, sourcePaneId: pane.id }));
      e.dataTransfer.effectAllowed = 'move';
      usePanelLayoutStore.getState().startDrag(tab, pane.id);
    },
    [pane.id],
  );

  const handleDragEnd = useCallback(() => {
    usePanelLayoutStore.getState().endDrag();
    setDropIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      setDropIndex(null);

      const raw = e.dataTransfer.getData('application/pane-tab');
      if (raw) {
        const data: DragPayload = JSON.parse(raw);

        if (data.sourcePaneId === pane.id) {
          // Reorder within same group
          const newTabs = [...pane.tabs];
          const fromIndex = newTabs.indexOf(data.tab);
          if (fromIndex !== -1 && fromIndex !== toIndex) {
            newTabs.splice(fromIndex, 1);
            newTabs.splice(toIndex, 0, data.tab);
            usePanelLayoutStore.getState().reorderTabs(pane.id, newTabs);
          }
        } else {
          // Move from another group
          usePanelLayoutStore.getState().moveTab(data.sourcePaneId, data.tab, pane.id);
        }
      }

      usePanelLayoutStore.getState().endDrag();
    },
    [pane.id, pane.tabs],
  );

  return (
    <div
      className="flex items-center bg-surface-elevated/50 px-1 py-0.5"
      data-pane-id={pane.id}
      onDragLeave={handleDragLeave}
    >
      <div className="flex gap-0.5">
        {pane.tabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            draggable
            onDragStart={(e) => handleDragStart(e, tab)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => usePanelLayoutStore.getState().setActiveTab(pane.id, tab)}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === pane.activeTab
                ? 'bg-accent/20 text-accent-light'
                : 'text-muted hover:text-primary'
            } ${dropIndex === index ? 'ring-1 ring-accent' : ''}`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Drop zone overlay (rendered by PaneGroupRenderer) ──────────

interface DropZoneOverlayProps {
  paneId: string;
}

export function DropZoneOverlay({ paneId }: DropZoneOverlayProps) {
  const isDragActive = usePanelLayoutStore((s) => s.draggedTab !== null);
  const [activeEdge, setActiveEdge] = useState<DropEdge | null>(null);

  // Safety net: if the drag source element is removed from the DOM mid-drag,
  // the browser never fires dragend on it. Listen at the document level to
  // catch Escape, drops outside the window, or any other missed cleanup.
  useEffect(() => {
    if (!isDragActive) return;
    const cleanup = () => usePanelLayoutStore.getState().endDrag();
    document.addEventListener('dragend', cleanup);
    return () => document.removeEventListener('dragend', cleanup);
  }, [isDragActive]);

  // Don't show drop zones on the source pane (if it's a single-pane layout)
  if (!isDragActive) return null;

  const handleDragOver = (e: React.DragEvent, edge: DropEdge) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setActiveEdge(edge);
  };

  const handleDragLeave = (edge: DropEdge) => {
    setActiveEdge((prev) => (prev === edge ? null : prev));
  };

  const handleDrop = (e: React.DragEvent, edge: DropEdge) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveEdge(null);

    const raw = e.dataTransfer.getData('application/pane-tab');
    if (raw) {
      const data: DragPayload = JSON.parse(raw);

      if (edge === 'center') {
        // Merge into this pane group
        if (data.sourcePaneId !== paneId) {
          usePanelLayoutStore.getState().moveTab(data.sourcePaneId, data.tab, paneId);
        }
      } else {
        const direction = edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical';
        const side = edge === 'left' || edge === 'top' ? 'first' : 'second';
        usePanelLayoutStore.getState().splitPane(paneId, direction, side, data.tab);
      }
    }

    usePanelLayoutStore.getState().endDrag();
  };

  // Hit zones are small regions at the edges for detection
  const hitZones: { edge: DropEdge; style: React.CSSProperties }[] = [
    { edge: 'left', style: { left: 0, top: 0, width: '20%', height: '100%' } },
    { edge: 'right', style: { right: 0, top: 0, width: '20%', height: '100%' } },
    { edge: 'top', style: { left: '20%', top: 0, width: '60%', height: '30%' } },
    { edge: 'bottom', style: { left: '20%', bottom: 0, width: '60%', height: '30%' } },
  ];

  // Preview highlights show 50% of the pane to preview the split
  const previewStyles: Record<DropEdge, React.CSSProperties> = {
    left:   { left: 0, top: 0, width: '50%', height: '100%' },
    right:  { right: 0, top: 0, width: '50%', height: '100%' },
    top:    { left: 0, top: 0, width: '100%', height: '50%' },
    bottom: { left: 0, bottom: 0, width: '100%', height: '50%' },
    center: { inset: 0 },
  };

  return (
    <>
      {/* Preview highlight — shows 50% split preview, non-interactive */}
      {activeEdge && (
        <div
          style={{
            ...previewStyles[activeEdge],
            position: 'absolute',
            background: 'var(--th-accent)',
            opacity: 0.15,
            transition: 'opacity 0.15s',
            pointerEvents: 'none',
            zIndex: 18,
            borderRadius: 4,
          }}
        />
      )}
      {/* Center zone — sits behind edge zones, covers full area, merges tab into this group */}
      <div
        onDragOver={(e) => handleDragOver(e, 'center')}
        onDragLeave={() => handleDragLeave('center')}
        onDrop={(e) => handleDrop(e, 'center')}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'auto',
          zIndex: 19,
        }}
      />
      {/* Edge hit zones — sit on top of center, invisible, detect edge drops */}
      {hitZones.map(({ edge, style }) => (
        <div
          key={edge}
          onDragOver={(e) => handleDragOver(e, edge)}
          onDragLeave={() => handleDragLeave(edge)}
          onDrop={(e) => handleDrop(e, edge)}
          style={{
            ...style,
            position: 'absolute',
            pointerEvents: 'auto',
            zIndex: 20,
          }}
        />
      ))}
    </>
  );
}
