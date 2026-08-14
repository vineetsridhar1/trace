import { useEffect, useState } from "react";
import { UPDATE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { BranchCombobox } from "../channel/BranchCombobox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";

export function EditRepoDialog({
  repoId,
  name,
  remoteUrl,
  defaultBranch,
  webhookActive,
  open,
  onOpenChange,
}: {
  repoId: string;
  name: string;
  remoteUrl: string | null;
  defaultBranch: string;
  webhookActive: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [editName, setEditName] = useState(name);
  const [editRemoteUrl, setEditRemoteUrl] = useState(remoteUrl ?? "");
  const [editBranch, setEditBranch] = useState(defaultBranch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEditName(name);
    setEditRemoteUrl(remoteUrl ?? "");
    setEditBranch(defaultBranch);
    setError(null);
  }, [defaultBranch, name, open, remoteUrl]);

  const handleSave = async () => {
    const trimmedName = editName.trim();
    const trimmedBranch = editBranch.trim();
    if (!trimmedName || !trimmedBranch) {
      setError("Repository name and default branch are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(UPDATE_REPO_MUTATION, {
          id: repoId,
          input: {
            name: trimmedName,
            remoteUrl: editRemoteUrl.trim() || null,
            defaultBranch: trimmedBranch,
          },
        })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      onOpenChange(false);
    } catch {
      setError("Failed to update repository. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit repository</DialogTitle>
          <DialogDescription>
            Update how this repository appears and runs in Trace.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor={`repo-name-${repoId}`} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={`repo-name-${repoId}`}
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`repo-remote-${repoId}`} className="text-sm font-medium">
              Remote URL
            </label>
            <Input
              id={`repo-remote-${repoId}`}
              value={editRemoteUrl}
              onChange={(event) => setEditRemoteUrl(event.target.value)}
              placeholder="https://github.com/owner/repository.git"
              disabled={webhookActive}
            />
            {webhookActive ? (
              <p className="text-xs text-muted-foreground">
                Disconnect the webhook before changing the remote URL.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Default branch</p>
            <BranchCombobox repoId={repoId} value={editBranch} onChange={setEditBranch} />
          </div>
          {error ? (
            <p aria-live="polite" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
