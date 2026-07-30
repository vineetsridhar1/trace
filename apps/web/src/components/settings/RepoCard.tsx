import { useState } from "react";
import { GitBranch, Pencil, Check, X } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import {
  UPDATE_REPO_MUTATION,
  REGISTER_REPO_WEBHOOK_MUTATION,
  UNREGISTER_REPO_WEBHOOK_MUTATION,
} from "@trace/client-core";
import { Button } from "../ui/button";
import { BranchCombobox } from "../channel/BranchCombobox";
import { RepoDesktopSection } from "./RepoDesktopSection";
import { DisabledTooltip } from "../ui/DisabledTooltip";
import { WEBHOOK_REPO_REMOTE_REQUIRED, hasRepoRemote } from "../../lib/repo-capabilities";
import { isLocalMode } from "../../lib/runtime-mode";
import { RepoApplicationsSection } from "./repo-applications/RepoApplicationsSection";
import { SettingsStatusPill } from "./SettingsStatusPill";

const isElectron = typeof window.trace?.getRepoConfig === "function";
const LOCAL_MODE_WEBHOOK_DISABLED = "Local mode does not support GitHub webhooks.";

export function RepoCard({
  id,
  desktopRefreshKey,
}: {
  key?: React.Key;
  id: string;
  desktopRefreshKey?: number;
}) {
  const name = useEntityField("repos", id, "name");
  const remoteUrl = useEntityField("repos", id, "remoteUrl");
  const defaultBranch = useEntityField("repos", id, "defaultBranch");
  const webhookActive = useEntityField("repos", id, "webhookActive") as boolean | undefined;
  const [editing, setEditing] = useState(false);
  const [editBranch, setEditBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [webhookPending, setWebhookPending] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const webhookDisabledReason = isLocalMode
    ? LOCAL_MODE_WEBHOOK_DISABLED
    : hasRepoRemote({ remoteUrl })
      ? null
      : WEBHOOK_REPO_REMOTE_REQUIRED;

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
      await client
        .mutation(UPDATE_REPO_MUTATION, {
          id,
          input: { defaultBranch: trimmed },
        })
        .toPromise();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleWebhook = async () => {
    if (webhookPending || webhookDisabledReason) return;

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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
          <GitBranch size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
            <SettingsStatusPill
              tone={webhookActive ? "success" : "muted"}
              label={webhookActive ? "Webhook connected" : remoteUrl ? "Webhook off" : "Local only"}
            />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {remoteUrl ?? "Local project — no remote configured"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {editing ? (
            <>
              <span>Default branch</span>
              <div className="w-40">
                <BranchCombobox repoId={id} value={editBranch} onChange={setEditBranch} />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={saveBranch}
                disabled={saving}
                aria-label="Save default branch"
              >
                <Check size={12} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={cancelEditing}
                aria-label="Cancel editing default branch"
              >
                <X size={12} />
              </Button>
            </>
          ) : (
            <>
              <span>Default branch</span>
              <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {defaultBranch}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={startEditing}
                aria-label="Edit default branch"
              >
                <Pencil size={11} />
              </Button>
            </>
          )}
        </div>
      </div>

      {!webhookActive && remoteUrl ? (
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            Connect the webhook to sync pull-request status and respond to GitHub events.
          </p>
          <DisabledTooltip message={webhookDisabledReason}>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleWebhook}
              disabled={webhookPending || !!webhookDisabledReason}
            >
              {webhookPending ? "Connecting..." : "Connect webhook"}
            </Button>
          </DisabledTooltip>
        </div>
      ) : webhookActive ? (
        <div className="flex justify-end border-t border-border px-4 py-2">
          <DisabledTooltip message={webhookDisabledReason}>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleWebhook}
              disabled={webhookPending || !!webhookDisabledReason}
            >
              {webhookPending ? "Disconnecting..." : "Disconnect webhook"}
            </Button>
          </DisabledTooltip>
        </div>
      ) : null}
      {webhookError && (
        <p className="border-t border-border px-4 py-2 text-xs text-destructive">{webhookError}</p>
      )}

      {isElectron && <RepoDesktopSection repoId={id} desktopRefreshKey={desktopRefreshKey} />}
      <RepoApplicationsSection repoId={id} />
    </div>
  );
}
