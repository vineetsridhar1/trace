import { EditDiffPreview as SharedEditDiffPreview } from '@trace/shared-ui';
import type { ServerEvent } from '../types';
import { usePanelLayoutStore } from '../stores/panelLayoutStore';

export function EditDiffPreview({ event }: { event: ServerEvent }) {
  return (
    <SharedEditDiffPreview
      event={event}
      onFileClick={(path) => usePanelLayoutStore.getState().navigateToFile(path)}
    />
  );
}
