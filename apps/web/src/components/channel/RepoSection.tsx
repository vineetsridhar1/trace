import { AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { useEntityIds, useEntityField } from "../../stores/entity";
import type { RuntimeInfo } from "../session/RuntimeSelector";
import { RepoNotLinkedWarning } from "./RepoNotLinkedWarning";

interface RepoSectionProps {
  repoId: string | undefined;
  branch: string;
  runtimeInfo: RuntimeInfo | null;
  onRepoChange: (repoId: string | undefined) => void;
  onBranchChange: (branch: string) => void;
  onRuntimeInfoChange: (info: RuntimeInfo) => void;
}

export function RepoSection({
  repoId,
  branch,
  runtimeInfo,
  onRepoChange,
  onBranchChange,
  onRuntimeInfoChange,
}: RepoSectionProps) {
  const repoIds = useEntityIds("repos");
  const selectedRepoName = useEntityField("repos", repoId ?? "", "name");
  const isDeviceBridge = runtimeInfo?.hostingMode === "local";
  const isUnlinked = repoId && isDeviceBridge && runtimeInfo?.registeredRepoIds
    && !runtimeInfo.registeredRepoIds.includes(repoId);

  if (repoIds.length === 0) return null;

  const triggerLabel = repoId ? (selectedRepoName ?? repoId) : "No repo";

  return (
    <>
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">
          Repository
        </label>
        <Select
          value={repoId ?? "__none__"}
          onValueChange={(v) => {
            if (v) {
              onRepoChange(v === "__none__" ? undefined : v);
              onBranchChange("");
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{triggerLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No repo</SelectItem>
            {repoIds.map((id) => (
              <RepoOption
                key={id}
                id={id}
                isDeviceBridge={isDeviceBridge}
                registeredRepoIds={runtimeInfo?.registeredRepoIds}
              />
            ))}
          </SelectContent>
        </Select>
      </div>

      {repoId && (
        <div className="col-span-2">
          <label className="mb-1.5 block text-sm text-muted-foreground">
            Branch
          </label>
          <BranchInput repoId={repoId} value={branch} onChange={onBranchChange} />
        </div>
      )}

      {isUnlinked && repoId && (
        <div className="col-span-2">
          <RepoNotLinkedWarning
            repoId={repoId}
            onLinked={() => {
              if (runtimeInfo) {
                onRuntimeInfoChange({
                  ...runtimeInfo,
                  registeredRepoIds: [...runtimeInfo.registeredRepoIds, repoId],
                });
              }
            }}
          />
        </div>
      )}
    </>
  );
}

/** Select option for a single repo — shows "not linked" badge when needed */
function RepoOption({ id, isDeviceBridge, registeredRepoIds }: {
  id: string;
  isDeviceBridge: boolean;
  registeredRepoIds?: string[];
}) {
  const name = useEntityField("repos", id, "name");
  const isLinked = !isDeviceBridge || !registeredRepoIds || registeredRepoIds.includes(id);

  return (
    <SelectItem value={id}>
      <span className="flex items-center gap-1.5">
        {name ?? id}
        {!isLinked && (
          <span className="flex items-center gap-0.5 text-xs text-amber-500">
            <AlertTriangle size={10} />
            not linked
          </span>
        )}
      </span>
    </SelectItem>
  );
}

/** Text input for branch name with default branch as placeholder */
function BranchInput({ repoId, value, onChange }: {
  repoId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const defaultBranch = useEntityField("repos", repoId, "defaultBranch");

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={defaultBranch ?? "main"}
    />
  );
}
