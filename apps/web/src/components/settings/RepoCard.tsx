import { useEffect, useState } from "react";
import { GitBranch, FolderOpen, Pencil, Check, X } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import {
  UPDATE_REPO_MUTATION,
  REGISTER_REPO_WEBHOOK_MUTATION,
  UNREGISTER_REPO_WEBHOOK_MUTATION,
} from "../../lib/mutations";
import { Button } from "../ui/button";
import { BranchCombobox } from "../channel/BranchCombobox";

const isElectron = typeof window.trace?.getRepoConfig === "function";

function getHookStatusTone(
  linkedPath: string | null,
  gitHooksEnabled: boolean,
  status: DesktopRepoGitHookStatus | null,
): string {
  if (!linkedPath) return "text-muted-foreground";
  if (!gitHooksEnabled) return "text-muted-foreground";
  if (!status) return "text-muted-foreground";

  switch (status.state) {
    case "trace_managed":
    case "chained":
      return "text-emerald-500";
    case "custom_present":
      return "text-amber-500";
    case "error":
    case "not_installed":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function getHookStatusLabel(
  linkedPath: string | null,
  gitHooksEnabled: boolean,
  status: DesktopRepoGitHookStatus | null,
): string {
  if (!linkedPath) return "Not linked on this desktop";
  if (!gitHooksEnabled) {
    if (status?.state === "custom_present") {
      return "Custom git hooks present";
    }
    return "Git hooks disabled";
  }
  if (!status) return "Checking git hooks...";

  switch (status.state) {
    case "trace_managed":
      return "Trace hooks installed";
    case "chained":
      return "Trace hooks chained with existing hooks";
    case "custom_present":
      return "Custom hooks detected";
    case "not_installed":
      return "Trace hooks missing";
    case "error":
      return "Trace hooks need repair";
    default:
      return "Checking git hooks...";
  }
}

function getHookStatusDetail(
  gitHooksEnabled: boolean,
  status: DesktopRepoGitHookStatus | null,
): string | null {
  if (!status) return null;

  if (!gitHooksEnabled && status.state === "custom_present") {
    return "Enabling Trace hooks will preserve and chain your existing Git hooks.";
  }

  if (status.state === "chained") {
    return "Existing custom Git hooks are preserved and run before Trace's hook runner.";
  }

  if (status.state === "error") {
    const errors = status.hooks
      .filter((hook) => hook.error)
      .map((hook) => `${hook.hookName}: ${hook.error}`)
      .join(" ");
    return errors || "The installed hook wrapper is missing its runner or chained hook.";
  }

  if (status.state === "not_installed") {
    const missingHooks = status.hooks
      .filter((hook) => hook.state === "not_installed")
      .map((hook) => hook.hookName)
      .join(", ");
    return missingHooks ? `Missing hooks: ${missingHooks}.` : null;
  }

  return null;
}

export function RepoCard({ id, desktopRefreshKey }: { id: string; desktopRefreshKey?: number }) {
  const name = useEntityField("repos", id, "name");
  const remoteUrl = useEntityField("repos", id, "remoteUrl");
  const defaultBranch = useEntityField("repos", id, "defaultBranch");
  const webhookActive = useEntityField("repos", id, "webhookActive") as boolean | undefined;
  const [editing, setEditing] = useState(false);
  const [editBranch, setEditBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [webhookPending, setWebhookPending] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [desktopRepoConfig, setDesktopRepoConfig] = useState<DesktopRepoConfig | null>(null);
  const [gitHookStatus, setGitHookStatus] = useState<DesktopRepoGitHookStatus | null>(null);
  const [gitHookPending, setGitHookPending] = useState(false);
  const [gitHookError, setGitHookError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const refreshDesktopState = async () => {
    if (!window.trace?.getRepoConfig) return;

    const repoConfig = await window.trace.getRepoConfig(id);
    setDesktopRepoConfig(repoConfig);

    if (!repoConfig) {
      setGitHookStatus(null);
      return;
    }

    const status = await window.trace.getRepoGitHookStatus(id);
    setGitHookStatus(status);
  };

  useEffect(() => {
    if (!isElectron) return;

    refreshDesktopState().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    });
  }, [id, desktopRefreshKey]);

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

  const linkToLocalPath = async () => {
    if (!window.trace?.pickFolder || !window.trace?.saveRepoPath || linking) return;

    setLinking(true);
    setGitHookError(null);

    try {
      const folderPath = await window.trace.pickFolder();
      if (!folderPath) {
        setLinking(false);
        return;
      }

      await window.trace.saveRepoPath(id, folderPath);
      await refreshDesktopState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    } finally {
      setLinking(false);
    }
  };

  const toggleGitHooks = async () => {
    if (!window.trace?.setRepoGitHooksEnabled || !desktopRepoConfig || gitHookPending) return;

    setGitHookPending(true);
    setGitHookError(null);

    try {
      const next = await window.trace.setRepoGitHooksEnabled(
        id,
        !desktopRepoConfig.gitHooksEnabled,
      );
      setDesktopRepoConfig(next.config);
      setGitHookStatus(next.status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    } finally {
      setGitHookPending(false);
    }
  };

  const repairGitHooks = async () => {
    if (!window.trace?.repairRepoGitHooks || gitHookPending) return;

    setGitHookPending(true);
    setGitHookError(null);

    try {
      const nextStatus = await window.trace.repairRepoGitHooks(id);
      setGitHookStatus(nextStatus);
      await refreshDesktopState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    } finally {
      setGitHookPending(false);
    }
  };

  const linkedPath = desktopRepoConfig?.path ?? null;
  const gitHooksEnabled = desktopRepoConfig?.gitHooksEnabled ?? false;
  const hookStatusLabel = getHookStatusLabel(linkedPath, gitHooksEnabled, gitHookStatus);
  const hookStatusDetail = getHookStatusDetail(gitHooksEnabled, gitHookStatus);
  const hookStatusTone = getHookStatusTone(linkedPath, gitHooksEnabled, gitHookStatus);
  const showRepairButton =
    !!linkedPath
    && gitHooksEnabled
    && !!gitHookStatus
    && (gitHookStatus.state === "error" || gitHookStatus.state === "not_installed");

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
                ? (webhookActive ? "Disconnecting..." : "Connecting...")
                : (webhookActive ? "Disconnect Webhook" : "Connect Webhook")}
            </Button>
          </div>
          {webhookError && (
            <p className="mt-2 text-xs text-destructive">{webhookError}</p>
          )}

          {isElectron && (
            <div className="mt-3 rounded-md border border-border/70 bg-surface-elevated/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">Desktop Linking</p>
                  {linkedPath ? (
                    <p className="mt-0.5 truncate text-xs text-emerald-500">{linkedPath}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-amber-500">Not linked on this computer</p>
                  )}
                </div>
                {!linkedPath && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={linkToLocalPath}
                    disabled={linking}
                  >
                    <FolderOpen size={12} />
                    {linking ? "Linking..." : "Link Local Path"}
                  </Button>
                )}
              </div>

              {linkedPath && (
                <>
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">Git Hooks</p>
                    </div>
                    <Button
                      variant={gitHooksEnabled ? "secondary" : "outline"}
                      size="sm"
                      onClick={toggleGitHooks}
                      disabled={gitHookPending}
                    >
                      {gitHookPending
                        ? (gitHooksEnabled ? "Disabling..." : "Enabling...")
                        : (gitHooksEnabled ? "Disable Hooks" : "Enable Hooks")}
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className={`text-xs ${hookStatusTone}`}>{hookStatusLabel}</p>
                    {showRepairButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={repairGitHooks}
                        disabled={gitHookPending}
                      >
                        Repair Hooks
                      </Button>
                    )}
                  </div>

                  {hookStatusDetail && (
                    <p className="mt-2 text-xs text-muted-foreground">{hookStatusDetail}</p>
                  )}
                </>
              )}

              {gitHookError && (
                <p className="mt-2 text-xs text-destructive">{gitHookError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
