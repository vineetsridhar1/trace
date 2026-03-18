import { AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useEntityIds, useEntityField } from "../../stores/entity";
import type { RuntimeInfo } from "../session/RuntimeSelector";
import { BranchCombobox } from "./BranchCombobox";

interface RepoSectionProps {
  repoId: string | undefined;
  branch: string;
  runtimeInfo: RuntimeInfo | null;
  runtimeInstanceId: string | undefined;
  onRepoChange: (repoId: string | undefined) => void;
  onBranchChange: (branch: string) => void;
}

export function RepoSection({
  repoId,
  branch,
  runtimeInfo,
  runtimeInstanceId,
  onRepoChange,
  onBranchChange,
}: RepoSectionProps) {
  const repoIds = useEntityIds("repos");
  const isDeviceBridge = runtimeInfo?.hostingMode === "local";

  if (repoIds.length === 0) return null;

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
            <SelectValue />
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
          <BranchCombobox
            repoId={repoId}
            runtimeInstanceId={runtimeInstanceId}
            value={branch}
            onChange={onBranchChange}
          />

        </div>
      )}
    </>
  );
}

/** Select option for a single repo — disabled when not linked to the device bridge */
function RepoOption({ id, isDeviceBridge, registeredRepoIds }: {
  id: string;
  isDeviceBridge: boolean;
  registeredRepoIds?: string[];
}) {
  const name = useEntityField("repos", id, "name");
  const isLinked = !isDeviceBridge || !registeredRepoIds || registeredRepoIds.includes(id);

  return (
    <SelectItem value={id} disabled={!isLinked}>
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
