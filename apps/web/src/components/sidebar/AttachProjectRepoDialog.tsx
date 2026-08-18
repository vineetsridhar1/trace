import { useEffect, useState, type FormEvent } from "react";
import { UPDATE_CHANNEL_MUTATION, useEntityField, useEntityIds } from "@trace/client-core";
import { client } from "../../lib/urql";
import { BranchCombobox } from "../channel/BranchCombobox";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogClose as DialogClose,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { RepoName } from "./RepoName";

export function AttachProjectRepoDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentRepo = useEntityField("channels", projectId, "repo") as
    | { id: string; name: string }
    | null
    | undefined;
  const currentBranch = useEntityField("channels", projectId, "baseBranch") as
    | string
    | null
    | undefined;
  const repoIds = useEntityIds("repos");
  const [repoId, setRepoId] = useState("");
  const [branch, setBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BranchCombobox falls back to the repo default when no branch is picked, so
  // save that same value instead of clearing the project's base branch.
  const selectedRepoDefaultBranch = useEntityField("repos", repoId, "defaultBranch") as
    | string
    | null
    | undefined;

  useEffect(() => {
    if (!open) return;
    setRepoId(currentRepo?.id ?? "");
    setBranch(currentBranch ?? "");
    setError(null);
  }, [currentBranch, currentRepo?.id, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await client
        .mutation(UPDATE_CHANNEL_MUTATION, {
          id: projectId,
          input: {
            repoId: repoId || null,
            baseBranch: repoId ? branch || selectedRepoDefaultBranch || null : null,
          },
        })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      onOpenChange(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update project repository.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Project repository</DialogTitle>
            <DialogDescription>
              Sessions and artifacts use this repository as project context.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Repository</label>
              <Select
                value={repoId || "__none__"}
                onValueChange={(value: string | null) => {
                  setRepoId(value && value !== "__none__" ? value : "");
                  setBranch("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {repoId ? <RepoName repoId={repoId} /> : "No repository"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No repository</SelectItem>
                  {repoIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      <RepoName repoId={id} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {repoIds.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Add a repository in Settings before attaching it to this project.
                </p>
              )}
            </div>
            {repoId && (
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Base branch</label>
                <BranchCombobox repoId={repoId} value={branch} onChange={setBranch} />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
