import type { TicketRow } from "./tickets-table-types";

export function TicketAssigneesCell({ row }: { row?: TicketRow }) {
  if (!row) return null;

  const assignees = row.assignees ?? [];
  if (assignees.length === 0) {
    return <span className="text-xs text-muted-foreground/50">Unassigned</span>;
  }

  return (
    <div className="flex h-full items-center gap-1">
      {assignees.slice(0, 3).map((user) => (
        <div key={user.id} className="flex items-center gap-1">
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="h-4 w-4 rounded-full"
            />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {user.name}
          </span>
        </div>
      ))}
      {assignees.length > 3 && (
        <span className="text-xs text-muted-foreground">
          +{assignees.length - 3}
        </span>
      )}
    </div>
  );
}
