import { memo } from 'react';
import { FiCheck } from 'react-icons/fi';
import type { ServerEvent, TodoItem } from '../../types';

export const TodoListPreview = memo(function TodoListPreview({
  event,
}: {
  event: ServerEvent;
}) {
  const input = event.toolInput as Record<string, unknown> | null;
  const todos = (input?.todos ?? []) as TodoItem[];
  if (!Array.isArray(todos) || todos.length === 0) return null;

  const allCompleted = todos.every((t) => t.status === 'completed');
  if (!allCompleted) return null;

  return (
    <ul className="mt-2 space-y-1.5 pl-1">
      {todos.map((t, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          <FiCheck className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
          <span className="text-muted line-through">
            {t.content}
          </span>
        </li>
      ))}
    </ul>
  );
});
