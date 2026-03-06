import type { RefObject } from 'react';
import type { PaneGroup, ViewMode } from '../../stores/panelLayoutStore';
import { PaneTabBar, DropZoneOverlay } from './PaneTabBar';

interface PaneGroupRendererProps {
  pane: PaneGroup;
  renderPaneContent: (mode: ViewMode, paneId: string) => React.ReactNode;
  singletonClaimRefs: Map<string, RefObject<HTMLDivElement | null>>;
}

export function PaneGroupRenderer({
  pane,
  renderPaneContent,
  singletonClaimRefs,
}: PaneGroupRendererProps) {
  const isSingleton = pane.activeTab === 'terminal' || pane.activeTab === 'browser';

  // Ensure singleton claim ref exists for this pane
  if (isSingleton && !singletonClaimRefs.has(pane.id)) {
    singletonClaimRefs.set(pane.id, { current: null });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-sm border border-edge">
      <PaneTabBar pane={pane} />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {isSingleton ? (
          <div
            ref={(el) => {
              const ref = singletonClaimRefs.get(pane.id);
              if (ref) (ref as { current: HTMLDivElement | null }).current = el;
            }}
            className="min-h-0 flex-1"
          />
        ) : (
          renderPaneContent(pane.activeTab, pane.id)
        )}
        <DropZoneOverlay paneId={pane.id} />
      </div>
    </div>
  );
}
