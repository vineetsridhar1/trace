import { cn } from "../../lib/utils";
import type { ActionMeta } from "./suggestion-meta";
import { PRIORITY_STYLES } from "./suggestion-meta";

interface SuggestionExpandedDetailsProps {
  args: Record<string, unknown>;
  meta: ActionMeta;
  editedArgs: Record<string, string>;
  onEdit: (field: string, value: string) => void;
}

export function SuggestionExpandedDetails({
  args,
  meta,
  editedArgs,
  onEdit,
}: SuggestionExpandedDetailsProps) {
  return (
    <div className="space-y-2.5 border-t border-border/50 pt-2.5">
      {meta.editableFields.map((field) => {
        const value = editedArgs[field] ?? ((args[field] as string) ?? "");
        const label = meta.fieldLabels[field] ?? field;
        const isLong = field === "description" || field === "prompt" || field === "text";

        if (field === "priority") {
          return (
            <div key={field}>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
              <div className="flex gap-1">
                {["low", "medium", "high", "urgent"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit("priority", p); }}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors",
                      (editedArgs.priority ?? args.priority) === p
                        ? PRIORITY_STYLES[p]
                        : "bg-surface-elevated text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (field === "status") {
          return (
            <div key={field}>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
              <div className="flex flex-wrap gap-1">
                {["backlog", "todo", "in_progress", "in_review", "done"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEdit("status", s); }}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors",
                      (editedArgs.status ?? args.status) === s
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-elevated text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={field}>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
            {isLong ? (
              <textarea
                value={value}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEdit(field, e.target.value)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                rows={2}
                className="w-full rounded-md border border-border bg-surface-deep px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEdit(field, e.target.value)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="w-full rounded-md border border-border bg-surface-deep px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
