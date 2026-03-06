import { memo } from 'react';
import type { ServerEvent, TokenUsageInfo } from '../types';
import { formatTime, stripTraceInternal } from '../utils';
import { UserPromptBubble } from './thread-events/UserPromptBubble';
import { ToolUseRow } from './thread-events/ToolUseRow';
import { StopBubble } from './thread-events/StopBubble';
import { GenericEventRow } from './thread-events/GenericEventRow';
import { AssistantTextRow } from './thread-events/AssistantTextRow';

/** Detect raw JSON tool responses that leak into lastAssistantMessage */
function looksLikeRawJson(text: string): boolean {
  const t = text.trimStart();
  return /^\[\s*\{/.test(t) || /^\{\s*"/.test(t);
}

function extractAssistantText(event: ServerEvent): string {
  if (!event.lastAssistantMessage) return '';
  const text = stripTraceInternal(event.lastAssistantMessage).trim();
  if (!text || looksLikeRawJson(text)) return '';
  return text;
}

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
    const assistantText = extractAssistantText(event);
    return (
      <>
        {assistantText && <AssistantTextRow text={assistantText} />}
        <ToolUseRow event={event} time={time} onFileClick={onFileClick} />
      </>
    );
  }

  if (event.hookEventName === 'PostToolUse') {
    const assistantText = extractAssistantText(event);
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
