import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";
import { useAuthStore } from "../../stores/auth";
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

const isElectron = typeof window.trace?.pickFolder === "function";

interface DetectedRepo {
  name: string;
  remoteUrl: string;
  defaultBranch: string;
}

export function CreateRepoDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [detected, setDetected] = useState<DetectedRepo | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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

  async function handleLink() {
    const repo =
      detected ??
      (manualName.trim() && manualRemoteUrl.trim()
        ? { name: manualName.trim(), remoteUrl: manualRemoteUrl.trim(), defaultBranch: "main" }
        : null);
    if (!repo || !activeOrgId) return;

    setCreating(true);
    try {
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

      if (result.data?.createRepo) {
        // Persist local path mapping so the bridge can find the repo on disk
        if (selectedPath && window.trace?.saveRepoPath) {
          try {
            await window.trace.saveRepoPath(result.data.createRepo.id, selectedPath);
          } catch (saveErr) {
            setError(saveErr instanceof Error ? saveErr.message : "Failed to save local path");
            return;
          }
        }
        resetAndClose();
        onCreated?.();
      }
    } finally {
      setCreating(false);
    }
  }

  function resetAndClose() {
    setDetected(null);
    setSelectedPath(null);
    setError(null);
    setManualName("");
    setManualRemoteUrl("");
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAndClose();
    else setOpen(true);
  }

  const canSubmit = detected || (manualName.trim() && manualRemoteUrl.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="inline-flex">
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus size={14} />
          Link Repository
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Repository</DialogTitle>
          <DialogDescription>
            {isElectron
              ? "Select a local folder containing a git repository."
              : "Enter the git remote URL to link a repository to your organization."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {isElectron ? (
            <>
              <Button variant="outline" className="w-full gap-2" onClick={handlePickFolder}>
                <FolderOpen size={16} />
                Choose Folder
              </Button>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {detected && (
                <div className="rounded-lg border border-border bg-surface-deep p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{detected.name}</span>
                    <span className="text-xs text-muted-foreground">{detected.defaultBranch}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{detected.remoteUrl}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Repository name
                </label>
                <Input
                  value={manualName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualName(e.target.value)}
                  placeholder="e.g. api-server"
                  autoFocus={!isMobile}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Remote URL</label>
                <Input
                  value={manualRemoteUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualRemoteUrl(e.target.value)}
                  placeholder="e.g. git@github.com:org/repo.git"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleLink} disabled={!canSubmit || creating}>
            {creating ? "Linking..." : "Link Repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
