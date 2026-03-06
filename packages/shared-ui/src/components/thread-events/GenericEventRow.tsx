import { memo } from 'react';
import type { ServerEvent } from '../../types';
import { serializeUnknown } from '../../utils';

export const GenericEventRow = memo(function GenericEventRow({
  event,
  time,
}: {
  event: ServerEvent;
  time: string;
}) {
  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <span className="activity-row-icon">&bull;</span>
        <span className="activity-row-title">{event.hookEventName}</span>
        <span className="activity-row-time">{time}</span>
      </div>
      <details className="activity-row-details mt-1">
        <summary>Details</summary>
        <pre className="mt-1">{serializeUnknown(event.rawPayload, 600)}</pre>
      </details>
    </div>
  );
});
