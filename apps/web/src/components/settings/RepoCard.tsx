import { useState } from "react";
import { GitBranch, Pencil, Trash2 } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import {
  REGISTER_REPO_WEBHOOK_MUTATION,
  UNREGISTER_REPO_WEBHOOK_MUTATION,
} from "@trace/client-core";
import { Button } from "../ui/button";
import { RepoDesktopSection } from "./RepoDesktopSection";
import { DisabledTooltip } from "../ui/DisabledTooltip";
import { WEBHOOK_REPO_REMOTE_REQUIRED, hasRepoRemote } from "../../lib/repo-capabilities";
import { isLocalMode } from "../../lib/runtime-mode";
import { useUIStore } from "../../stores/ui";
import { RepoApplicationsSection } from "./repo-applications/RepoApplicationsSection";
import { SettingsStatusPill } from "./SettingsStatusPill";
import { LinkRepoDialog } from "./LinkRepoDialog";
import { EditRepoDialog } from "./EditRepoDialog";
import { DeleteRepoDialog } from "./DeleteRepoDialog";

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
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [webhookPending, setWebhookPending] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const setActivePage = useUIStore((state) => state.setActivePage);
  const setSettingsInitialTab = useUIStore((state) => state.setSettingsInitialTab);
  const webhookDisabledReason = isLocalMode
    ? LOCAL_MODE_WEBHOOK_DISABLED
    : hasRepoRemote({ remoteUrl })
      ? null
      : WEBHOOK_REPO_REMOTE_REQUIRED;

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

  const openGitHubApiKeySettings = () => {
    setSettingsInitialTab("api-keys");
    setActivePage("settings");
  };
  const isMissingGitHubToken = /no github token configured/i.test(webhookError ?? "");
  const webhookErrorMessage = webhookError?.replace(/^\[GraphQL\]\s*/i, "");

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
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate" title={remoteUrl ?? undefined}>
              {remoteUrl ?? "Local project — no remote configured"}
            </span>
            {isElectron ? (
              <RepoDesktopSection repoId={id} desktopRefreshKey={desktopRefreshKey} />
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span>Default branch</span>
          <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {defaultBranch}
          </code>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditOpen(true)}
            aria-label="Edit repository"
          >
            <Pencil size={11} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDeleteOpen(true)}
            aria-label="Delete repository"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {!remoteUrl ? (
        <div className="border-t border-border px-4 py-2.5">
          <LinkRepoDialog repoId={id} />
        </div>
      ) : null}

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
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
          <p className="text-xs text-destructive">{webhookErrorMessage}</p>
          {isMissingGitHubToken && (
            <Button variant="outline" size="sm" onClick={openGitHubApiKeySettings}>
              Add GitHub API token
            </Button>
          )}
        </div>
      )}

      <RepoApplicationsSection repoId={id} />
      <EditRepoDialog
        repoId={id}
        name={name ?? ""}
        remoteUrl={remoteUrl ?? null}
        defaultBranch={defaultBranch ?? "main"}
        webhookActive={!!webhookActive}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteRepoDialog
        repoId={id}
        repoName={name ?? "Repository"}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
