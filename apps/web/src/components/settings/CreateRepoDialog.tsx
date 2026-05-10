import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogTrigger as DialogTrigger,
  ResponsiveDialogDescription as DialogDescription,
} from "../ui/responsive-dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

const CREATE_REPO_MUTATION = gql`
  mutation CreateRepo($input: CreateRepoInput!) {
    createRepo(input: $input) {
      id
    }
  }
`;

const isElectron = typeof window !== "undefined" && typeof window.trace?.pickFolder === "function";
const canCreateLocalProject =
  typeof window !== "undefined" && typeof window.trace?.createLocalProject === "function";

interface DetectedRepo {
  name: string;
  remoteUrl: string | null;
  defaultBranch: string;
}

type RepoDialogMode = "link" | "create";

interface CreateRepoDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onCreated?: () => void;
}

export function CreateRepoDialog({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  onCreated,
}: CreateRepoDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [mode, setMode] = useState<RepoDialogMode>("link");
  const [detected, setDetected] = useState<DetectedRepo | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  // Manual fallback fields (browser only)
  const [manualName, setManualName] = useState("");
  const [manualRemoteUrl, setManualRemoteUrl] = useState("");
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const isMobile = useIsMobile();

  async function handlePickFolder() {
    setError(null);
    setDetected(null);

    const folderPath = await window.trace!.pickFolder();
    if (!folderPath) return; // cancelled
    setSelectedPath(folderPath);

    const result = await window.trace!.getGitInfo(folderPath);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setDetected({
      name: result.name,
      remoteUrl: result.remoteUrl,
      defaultBranch: result.defaultBranch,
    });
  }

  async function handlePickParentFolder() {
    setError(null);

    const folderPath = await window.trace!.pickFolder();
    if (!folderPath) return;
    setParentPath(folderPath);
  }

  async function createRepo(repo: DetectedRepo, localPath?: string) {
    if (!activeOrgId) return false;

    const result = await client
      .mutation(CREATE_REPO_MUTATION, {
        input: {
          organizationId: activeOrgId,
          name: repo.name,
          remoteUrl: repo.remoteUrl,
          defaultBranch: repo.defaultBranch,
        },
      })
      .toPromise();

    const repoId = result.data?.createRepo?.id;
    if (!repoId) return false;

    if (localPath && window.trace?.saveRepoPath) {
      await window.trace.saveRepoPath(repoId, localPath);
    }

    return true;
  }

  async function handleLink() {
    const repo =
      detected ??
      (manualName.trim()
        ? {
            name: manualName.trim(),
            remoteUrl: manualRemoteUrl.trim() || null,
            defaultBranch: "main",
          }
        : null);
    if (!repo || !activeOrgId) return;

    setCreating(true);
    try {
      const created = await createRepo(repo, selectedPath ?? undefined);
      if (created) {
        resetAndClose();
        onCreated?.();
      }
    } catch (saveErr) {
      setError(saveErr instanceof Error ? saveErr.message : "Failed to link repository");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateProject() {
    if (!activeOrgId || !parentPath || !projectName.trim() || !window.trace?.createLocalProject) {
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const result = await window.trace.createLocalProject({
        name: projectName.trim(),
        parentPath,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }

      const created = await createRepo(
        {
          name: result.name,
          remoteUrl: result.remoteUrl,
          defaultBranch: result.defaultBranch,
        },
        result.path,
      );
      if (created) {
        resetAndClose();
        onCreated?.();
      }
    } catch (createErr) {
      setError(createErr instanceof Error ? createErr.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  function resetAndClose() {
    setMode("link");
    setDetected(null);
    setSelectedPath(null);
    setError(null);
    setProjectName("");
    setParentPath(null);
    setManualName("");
    setManualRemoteUrl("");
    setUncontrolledOpen(false);
    onOpenChange?.(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAndClose();
    else {
      setUncontrolledOpen(true);
      onOpenChange?.(true);
    }
  }

  const canLink = detected || manualName.trim();
  const canCreate = canCreateLocalProject && !!parentPath && !!projectName.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger className="inline-flex">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus size={14} />
            Link Repository
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Repository</DialogTitle>
          <DialogDescription>
            {isElectron
              ? "Select an existing git repository or create a new local project."
              : "Enter repository details to link it to your organization."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {isElectron ? (
            <>
              {canCreateLocalProject && (
                <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-deep p-1">
                  <ModeButton active={mode === "link"} onClick={() => setMode("link")}>
                    Existing
                  </ModeButton>
                  <ModeButton active={mode === "create"} onClick={() => setMode("create")}>
                    New Project
                  </ModeButton>
                </div>
              )}

              {mode === "link" ? (
                <>
                  <Button variant="outline" className="w-full gap-2" onClick={handlePickFolder}>
                    <FolderOpen size={16} />
                    Choose Folder
                  </Button>

                  {detected && (
                    <RepoPreview
                      name={detected.name}
                      remoteUrl={detected.remoteUrl}
                      defaultBranch={detected.defaultBranch}
                    />
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm text-muted-foreground">
                      Project name
                    </label>
                    <Input
                      value={projectName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setProjectName(e.target.value)
                      }
                      placeholder="e.g. mobile-app"
                      autoFocus={!isMobile}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-muted-foreground">
                      Location
                    </label>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={handlePickParentFolder}
                    >
                      <FolderOpen size={16} />
                      <span className="min-w-0 truncate">
                        {parentPath ?? "Choose parent folder"}
                      </span>
                    </Button>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Repository name
                </label>
                <Input
                  value={manualName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setManualName(e.target.value)
                  }
                  placeholder="e.g. api-server"
                  autoFocus={!isMobile}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Remote URL (optional)
                </label>
                <Input
                  value={manualRemoteUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setManualRemoteUrl(e.target.value)
                  }
                  placeholder="e.g. git@github.com:org/repo.git"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={mode === "create" ? handleCreateProject : handleLink}
            disabled={(mode === "create" ? !canCreate : !canLink) || creating}
          >
            {creating
              ? mode === "create"
                ? "Creating..."
                : "Linking..."
              : mode === "create"
                ? "Create Project"
                : "Link Repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-surface-elevated text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function RepoPreview({
  name,
  remoteUrl,
  defaultBranch,
}: {
  name: string;
  remoteUrl: string | null;
  defaultBranch: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-deep p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{defaultBranch}</span>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {remoteUrl ?? "No remote configured"}
      </p>
    </div>
  );
}
