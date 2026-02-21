import type { ServerEvent } from '../types';
import { extractPromptText, formatTime, isEditLikeEvent, serializeUnknown } from '../utils';
import { EditDiffPreview } from './EditDiffPreview';

export function ThreadEvent({ event }: { event: ServerEvent }) {
  const time = formatTime(event.timestamp);

  if (event.hookEventName === 'UserPromptSubmit') {
    return <UserPromptBubble event={event} time={time} />;
  }

  if (event.hookEventName === 'PostToolUse') {
    return <ToolUseRow event={event} time={time} />;
  }

  if (event.hookEventName === 'Stop') {
    return <StopBubble event={event} time={time} />;
  }

  return <GenericEventRow event={event} time={time} />;
}

function UserPromptBubble({ event, time }: { event: ServerEvent; time: string }) {
  const prompt =
    extractPromptText(event.rawPayload) ?? event.lastAssistantMessage ?? '(prompt)';

  return (
    <div className="thread-bubble flex justify-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm border border-violet-500/40 bg-violet-500/15 px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-violet-300">You</span>
          <span className="text-xs text-[#565f89]">{time}</span>
        </div>
        <div className="break-words whitespace-pre-wrap text-sm text-[#c0caf5]">
          {prompt.slice(0, 500)}
        </div>
      </div>
    </div>
  );
}

function ToolUseRow({ event, time }: { event: ServerEvent; time: string }) {
  const hasToolInput = event.toolInput !== null && event.toolInput !== undefined;
  const editLike = isEditLikeEvent(event);
  const activityLabel = editLike
    ? `${event.toolName ?? 'Edit'} applied`
    : `${event.toolName ?? 'Tool'} executed`;

  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <span className="activity-row-icon">{editLike ? '✏️' : '🛠'}</span>
        <span className="activity-row-title">{activityLabel}</span>
        <span className="activity-row-time">{time}</span>
      </div>
      {event.lastAssistantMessage && (
        <div className="activity-row-note">{event.lastAssistantMessage.slice(0, 320)}</div>
      )}
      {editLike ? (
        <EditDiffPreview event={event} />
      ) : (
        hasToolInput && (
          <details className="activity-row-details mt-1">
            <summary>Tool input</summary>
            <pre className="mt-1">{serializeUnknown(event.toolInput)}</pre>
          </details>
        )
      )}
      {event.toolResponse && !editLike && (
        <details className="activity-row-details mt-1">
          <summary>Tool output</summary>
          <pre className="mt-1">{serializeUnknown(event.toolResponse)}</pre>
        </details>
      )}
    </div>
  );
}

function StopBubble({ event, time }: { event: ServerEvent; time: string }) {
  return (
    <div className="thread-bubble flex justify-start">
      <div className="max-w-[85%] rounded-xl rounded-bl-sm border border-[#292e42] bg-[#1f2335] px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-violet-300">Claude</span>
          <span className="ml-auto text-xs text-[#565f89]">{time}</span>
        </div>
        {event.lastAssistantMessage ? (
          <div className="break-words whitespace-pre-wrap text-sm text-[#c0caf5]">
            {event.lastAssistantMessage}
          </div>
        ) : (
          <div className="text-sm text-[#565f89]">Claude completed the run.</div>
        )}
        <div className="mt-2 text-[11px] tracking-wide text-[#565f89] uppercase">Stop hook</div>
      </div>
    </div>
  );
}

function GenericEventRow({ event, time }: { event: ServerEvent; time: string }) {
  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <span className="activity-row-icon">•</span>
        <span className="activity-row-title">{event.hookEventName}</span>
        <span className="activity-row-time">{time}</span>
      </div>
      <details className="activity-row-details mt-1">
        <summary>Details</summary>
        <pre className="mt-1">{serializeUnknown(event.rawPayload, 600)}</pre>
      </details>
    </div>
  );
}
