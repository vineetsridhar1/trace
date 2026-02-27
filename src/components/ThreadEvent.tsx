import { memo } from 'react';
import type { ServerEvent } from '../types';
import { formatTime, stripTraceInternal } from '../utils';
import { UserPromptBubble } from './thread-events/UserPromptBubble';
import { ToolUseRow } from './thread-events/ToolUseRow';
import { StopBubble } from './thread-events/StopBubble';
import { GenericEventRow } from './thread-events/GenericEventRow';
import { AssistantTextRow } from './thread-events/AssistantTextRow';

export { PlanReview } from './thread-events/PlanReview';
export { AskUserQuestionInline } from './thread-events/AskUserQuestionInline';

export const ThreadEvent = memo(function ThreadEvent({
  event,
  duration,
}: {
  event: ServerEvent;
  duration?: number;
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
        <ToolUseRow event={event} time={time} />
      </>
    );
  }

  if (event.hookEventName === 'PostToolUse') {
    const assistantText = event.lastAssistantMessage ? stripTraceInternal(event.lastAssistantMessage).trim() : '';
    return (
      <>
        {assistantText && <AssistantTextRow text={assistantText} />}
        <ToolUseRow event={event} time={time} />
      </>
    );
  }

  if (event.hookEventName === 'Stop') {
    return <StopBubble event={event} time={time} duration={duration} />;
  }

  return <GenericEventRow event={event} time={time} />;
});
