import { Input } from "../ui/input";

export function ManualRepoForm({
  name,
  remoteUrl,
  defaultBranch,
  autoFocus,
  onNameChange,
  onRemoteUrlChange,
  onDefaultBranchChange,
}: {
  name: string;
  remoteUrl: string;
  defaultBranch: string;
  autoFocus: boolean;
  onNameChange: (name: string) => void;
  onRemoteUrlChange: (remoteUrl: string) => void;
  onDefaultBranchChange: (branch: string) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">Repository name</label>
        <Input
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
          placeholder="e.g. api-server"
          autoFocus={autoFocus}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">Default branch</label>
        <Input
          value={defaultBranch}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onDefaultBranchChange(e.target.value)
          }
          placeholder="e.g. main"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">
          Remote URL (optional)
        </label>
        <Input
          value={remoteUrl}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onRemoteUrlChange(e.target.value)
          }
          placeholder="e.g. git@github.com:org/repo.git"
        />
      </div>
    </>
  );
}
