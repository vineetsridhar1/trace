import type { ReadGlobGroupNode } from '../types';
import { extractReadGlobSummary, formatTime } from '../utils';

interface ReadGlobGroupProps {
  node: ReadGlobGroupNode;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ReadGlobGroup({ node, isExpanded, onToggle }: ReadGlobGroupProps) {
  return (
    <div className="activity-row activity-row-compact">
      <button
        type="button"
        onClick={onToggle}
        className="activity-row-header w-full cursor-pointer text-left"
      >
        <span className="activity-row-icon">📚</span>
        <span className="activity-row-title">{node.count} file scans (Read/Glob)</span>
        <span className="activity-row-time">
          {formatTime(node.startTimestamp)} - {formatTime(node.endTimestamp)}
        </span>
        <span className={`read-group-chevron text-[10px] text-[#7f8bbf] ${isExpanded ? 'open' : ''}`}>
          ▼
        </span>
      </button>

      {node.summaryLabels.length > 0 && (
        <div className="activity-row-note">{node.summaryLabels.join(' · ')}</div>
      )}

      <div className={`read-group-body ${isExpanded ? 'open' : ''}`}>
        <div className="space-y-1 pt-1">
          {node.events.map((eventItem) => (
            <div key={eventItem.id} className="activity-row-subline">
              <span className="font-semibold text-[#8f9bcf]">{eventItem.toolName ?? 'Read/Glob'}</span>
              <span className="mx-2 text-[#59689d]">·</span>
              <span className="text-[#7a87bb]">{extractReadGlobSummary(eventItem)}</span>
              <span className="ml-auto text-[#5e6b9f]">{formatTime(eventItem.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
