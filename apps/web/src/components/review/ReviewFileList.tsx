import type { ReviewFile } from "@trace/gql";
import { Check, FileCode2, MessageSquare } from "lucide-react";
import { cn } from "../../lib/utils";

interface ReviewFileListProps {
  files: ReviewFile[];
  activePath: string | null;
  onSelect(path: string): void;
}

export function ReviewFileList({ files, activePath, onSelect }: ReviewFileListProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface-deep">
      <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {files.length} changed file{files.length === 1 ? "" : "s"}
      </div>
      <div className="native-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => onSelect(file.path)}
            className={cn(
              "mb-0.5 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left",
              activePath === file.path
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {file.viewed ? (
              <Check className="mt-0.5 shrink-0 text-emerald-500" size={13} />
            ) : (
              <FileCode2 className="mt-0.5 shrink-0" size={13} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{file.path.split("/").at(-1)}</span>
              <span className="block truncate text-[10px] opacity-70">{file.path}</span>
              <span className="mt-0.5 flex gap-2 text-[10px]">
                <span className="text-emerald-500">+{file.additions}</span>
                <span className="text-red-400">-{file.deletions}</span>
              </span>
            </span>
            {file.commentCount > 0 ? (
              <span className="flex items-center gap-1 text-[10px]">
                <MessageSquare size={10} />
                {file.commentCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </aside>
  );
}
