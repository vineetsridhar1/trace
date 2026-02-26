import { memo } from 'react';
import type { ServerEvent, TodoItem } from '../../types';
import { isEditLikeEvent, normalizeToolName } from '../../utils';
import { EditDiffPreview } from '../EditDiffPreview';
import { SubagentRow } from '../SubagentRow';
import { BashToolRow } from './BashToolRow';
import { GenericToolRow } from './GenericToolRow';
import { WriteCodePreview } from './WriteCodePreview';
import { TodoListPreview } from './TodoListPreview';

export const ToolUseRow = memo(function ToolUseRow({
  event,
  time,
}: {
  event: ServerEvent;
  time: string;
}) {
  const toolName = normalizeToolName(event.toolName);
  const editLike = isEditLikeEvent(event);

  if (toolName === 'task') {
    return <SubagentRow event={event} />;
  }

  if (toolName === 'bash') {
    return <BashToolRow event={event} time={time} />;
  }

  if (toolName === 'todowrite') {
    const input = event.toolInput as Record<string, unknown> | null;
    const todos = (input?.todos ?? []) as TodoItem[];
    const allCompleted = Array.isArray(todos) && todos.length > 0 && todos.every((t) => t.status === 'completed');
    if (!allCompleted) return null;
    return (
      <div className="activity-row">
        <TodoListPreview event={event} />
      </div>
    );
  }

  if (!editLike) {
    return <GenericToolRow event={event} time={time} />;
  }

  return (
    <div className="activity-row">
      {toolName === 'write' ? (
        <WriteCodePreview event={event} />
      ) : (
        <EditDiffPreview event={event} />
      )}
    </div>
  );
});
