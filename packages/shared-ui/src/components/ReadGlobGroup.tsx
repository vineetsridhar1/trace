import type { ReadGlobGroupNode } from '../types';
import { extractReadGlobSummary, formatTime } from '../utils';

interface ReadGlobGroupProps {
  node: ReadGlobGroupNode;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ReadGlobGroup({ node, isExpanded, onToggle }: ReadGlobGroupProps) {
  return (
    <div className="activity-row">
      <button
        type="button"
        onClick={onToggle}
        className="activity-row-header w-full cursor-pointer text-left"
      >
        <span className="activity-row-title opacity-60 font-light">{node.count} file scans (Read/Glob)</span>
        <span className="activity-row-time">
          {formatTime(node.startTimestamp)} - {formatTime(node.endTimestamp)}
        </span>
        <span className={`read-group-chevron text-[10px] text-muted ${isExpanded ? 'open' : ''}`}>
          &#9660;
        </span>
      </button>

      <div className={`read-group-body ${isExpanded ? 'open' : ''}`}>
        <div className="space-y-1 pt-1">
          {node.events.map((eventItem) => (
            <div key={eventItem.id} className="activity-row-subline">
              <span className="font-semibold text-primary">{eventItem.toolName ?? 'Read/Glob'}</span>
              <span className="mx-2 text-faint">&middot;</span>
              <span className="text-muted">{extractReadGlobSummary(eventItem)}</span>
              <span className="ml-auto text-faint">{formatTime(eventItem.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
