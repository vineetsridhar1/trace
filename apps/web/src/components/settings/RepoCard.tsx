import { GitBranch } from "lucide-react";
import { useEntityField } from "../../stores/entity";

export function RepoCard({ id }: { id: string }) {
  const name = useEntityField("repos", id, "name");
  const remoteUrl = useEntityField("repos", id, "remoteUrl");
  const defaultBranch = useEntityField("repos", id, "defaultBranch");

  return (
    <div className="rounded-lg border border-border bg-surface-deep p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-surface-elevated p-1.5">
          <GitBranch size={16} className="text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{remoteUrl}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Default branch: <span className="text-foreground">{defaultBranch}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
