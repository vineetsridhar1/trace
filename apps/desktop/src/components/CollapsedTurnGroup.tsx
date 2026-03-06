import { CollapsedTurnGroup as SharedCollapsedTurnGroup } from '@trace/shared-ui';
import type { CollapsedTurnGroupNode } from '../types';
import { usePanelLayoutStore } from '../stores/panelLayoutStore';

interface CollapsedTurnGroupProps {
  node: CollapsedTurnGroupNode;
  isExpanded: boolean;
  onToggle: () => void;
  expandedReadGroupIds: Record<string, boolean>;
  toggleReadGroup: (groupId: string) => void;
}

export function CollapsedTurnGroup(props: CollapsedTurnGroupProps) {
  return (
    <SharedCollapsedTurnGroup
      {...props}
      onFileClick={(path) => usePanelLayoutStore.getState().navigateToFile(path)}
    />
  );
}
