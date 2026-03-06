import { memo } from 'react';
import { ThreadEvent as SharedThreadEvent } from '@trace/shared-ui';
import type { ServerEvent } from '../types';
import { useThreadStore } from '../stores/threadStore';
import { usePanelLayoutStore } from '../stores/panelLayoutStore';

export { PlanReview, AskUserQuestionInline } from '@trace/shared-ui';

export const ThreadEvent = memo(function ThreadEvent({
  event,
  duration,
}: {
  event: ServerEvent;
  duration?: number;
}) {
  const tokenUsage = useThreadStore((s) => s.tokenUsage);

  return (
    <SharedThreadEvent
      event={event}
      duration={duration}
      tokenUsage={tokenUsage}
      onFileClick={(path) => usePanelLayoutStore.getState().navigateToFile(path)}
    />
  );
});
