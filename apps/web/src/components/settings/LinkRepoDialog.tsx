import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "lucide-react";
import { UPDATE_REPO_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { useIsMobile } from "../../hooks/use-mobile";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";

export function LinkRepoDialog({ repoId }: { repoId: string }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedRemoteUrl = remoteUrl.trim();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setRemoteUrl("");
      setError(null);
    }
  };

  const linkRepo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedRemoteUrl || saving) return;

    setSaving(true);
    setError(null);
    try {
      const result = await client
        .mutation(UPDATE_REPO_MUTATION, {
          id: repoId,
          input: { remoteUrl: trimmedRemoteUrl },
        })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setRemoteUrl("");
      setError(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="mt-2 gap-1.5" />}>
        <Link size={14} />
        Link repo
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link repo</DialogTitle>
          <DialogDescription>
            Paste the HTTPS or SSH URL for this repository to enable cloud sessions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={linkRepo} className="space-y-4">
          <div>
            <label
              className="mb-1.5 block text-sm text-muted-foreground"
              htmlFor={`repo-remote-${repoId}`}
            >
              Repository URL
            </label>
            <Input
              id={`repo-remote-${repoId}`}
              value={remoteUrl}
              placeholder="https://github.com/org/repo.git"
              autoFocus={!isMobile}
              disabled={saving}
              onChange={(event) => setRemoteUrl(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmedRemoteUrl || saving}>
              {saving ? "Linking..." : "Link repo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
