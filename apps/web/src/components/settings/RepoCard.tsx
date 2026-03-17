import { useState } from "react";
import { GitBranch, Pencil, Check, X } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { UPDATE_REPO_MUTATION } from "../../lib/mutations";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function RepoCard({ id }: { id: string }) {
  const name = useEntityField("repos", id, "name");
  const remoteUrl = useEntityField("repos", id, "remoteUrl");
  const defaultBranch = useEntityField("repos", id, "defaultBranch");
  const [editing, setEditing] = useState(false);
  const [editBranch, setEditBranch] = useState("");
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setEditBranch(defaultBranch ?? "main");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditBranch("");
  };

  const saveBranch = async () => {
    const trimmed = editBranch.trim();
    if (!trimmed || trimmed === defaultBranch) {
      cancelEditing();
      return;
    }
    setSaving(true);
    try {
      await client.mutation(UPDATE_REPO_MUTATION, {
        id,
        input: { defaultBranch: trimmed },
      }).toPromise();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-deep p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-surface-elevated p-1.5">
          <GitBranch size={16} className="text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{remoteUrl}</p>
          <div className="mt-1 flex items-center gap-1.5">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Default branch:</span>
                <Input
                  value={editBranch}
                  onChange={(e) => setEditBranch(e.target.value)}
                  className="h-6 w-32 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveBranch();
                    if (e.key === "Escape") cancelEditing();
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={saveBranch}
                  disabled={saving}
                >
                  <Check size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={cancelEditing}
                >
                  <X size={12} />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Default branch: <span className="text-foreground">{defaultBranch}</span>
                </p>
                <button
                  onClick={startEditing}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit default branch"
                >
                  <Pencil size={10} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
