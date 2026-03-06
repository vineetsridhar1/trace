import { memo } from 'react';
import type { ServerEvent, TokenUsageInfo } from '../types';
import { formatTime, stripTraceInternal } from '../utils';
import { UserPromptBubble } from './thread-events/UserPromptBubble';
import { ToolUseRow } from './thread-events/ToolUseRow';
import { StopBubble } from './thread-events/StopBubble';
import { GenericEventRow } from './thread-events/GenericEventRow';
import { AssistantTextRow } from './thread-events/AssistantTextRow';

export const ThreadEvent = memo(function ThreadEvent({
  event,
  duration,
  onFileClick,
  tokenUsage,
}: {
  event: ServerEvent;
  duration?: number;
  onFileClick?: (path: string) => void;
  tokenUsage?: TokenUsageInfo | null;
}) {
  const time = formatTime(event.timestamp);

  if (event.hookEventName === 'UserPromptSubmit') {
    return <UserPromptBubble event={event} time={time} />;
  }

  if (event.hookEventName === 'PreToolUse') {
    const assistantText = event.lastAssistantMessage ? stripTraceInternal(event.lastAssistantMessage).trim() : '';
    return (
      <>
        {assistantText && <AssistantTextRow text={assistantText} />}
        <ToolUseRow event={event} time={time} onFileClick={onFileClick} />
      </>
    );
  }

  if (event.hookEventName === 'PostToolUse') {
    const assistantText = event.lastAssistantMessage ? stripTraceInternal(event.lastAssistantMessage).trim() : '';
    return (
      <>
        {assistantText && <AssistantTextRow text={assistantText} />}
        <ToolUseRow event={event} time={time} onFileClick={onFileClick} />
      </>
    );
  }

  if (event.hookEventName === 'Stop') {
    return <StopBubble event={event} time={time} duration={duration} tokenUsage={tokenUsage} />;
  }

  return <GenericEventRow event={event} time={time} />;
});
