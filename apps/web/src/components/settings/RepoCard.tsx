import { useState } from "react";
import { GitBranch, Pencil, Check, X } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import {
  UPDATE_REPO_MUTATION,
  REGISTER_REPO_WEBHOOK_MUTATION,
  UNREGISTER_REPO_WEBHOOK_MUTATION,
} from "../../lib/mutations";
import { Button } from "../ui/button";
import { BranchCombobox } from "../channel/BranchCombobox";
import { RepoDesktopSection } from "./RepoDesktopSection";

const isElectron = typeof window.trace?.getRepoConfig === "function";

export function RepoCard({ id, desktopRefreshKey }: { key?: React.Key; id: string; desktopRefreshKey?: number }) {
  const name = useEntityField("repos", id, "name");
  const remoteUrl = useEntityField("repos", id, "remoteUrl");
  const defaultBranch = useEntityField("repos", id, "defaultBranch");
  const webhookActive = useEntityField("repos", id, "webhookActive") as boolean | undefined;
  const [editing, setEditing] = useState(false);
  const [editBranch, setEditBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [webhookPending, setWebhookPending] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);

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

  const toggleWebhook = async () => {
    if (webhookPending) return;

    setWebhookPending(true);
    setWebhookError(null);

    try {
      const result = await client
        .mutation(
          webhookActive ? UNREGISTER_REPO_WEBHOOK_MUTATION : REGISTER_REPO_WEBHOOK_MUTATION,
          { repoId: id },
        )
        .toPromise();

      if (result.error) {
        setWebhookError(result.error.message);
      }
    } finally {
      setWebhookPending(false);
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
                <div className="w-48">
                  <BranchCombobox
                    repoId={id}
                    value={editBranch}
                    onChange={setEditBranch}
                  />
                </div>
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className={`text-xs ${webhookActive ? "text-emerald-500" : "text-muted-foreground"}`}>
              {webhookActive ? "GitHub webhook connected" : "GitHub webhook not connected"}
            </p>
            <Button
              variant={webhookActive ? "ghost" : "outline"}
              size="sm"
              onClick={toggleWebhook}
              disabled={webhookPending}
            >
              {webhookPending
                ? webhookActive
                  ? "Disconnecting..."
                  : "Connecting..."
                : webhookActive
                  ? "Disconnect Webhook"
                  : "Connect Webhook"}
            </Button>
          </div>
          {webhookError && (
            <p className="mt-2 text-xs text-destructive">{webhookError}</p>
          )}

          {isElectron && (
            <RepoDesktopSection repoId={id} desktopRefreshKey={desktopRefreshKey} />
          )}
        </div>
      </div>
    </div>
  );
}
