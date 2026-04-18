import { useEffect, useState, useCallback } from "react";
import { ChevronsUpDown, Check, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { REPO_BRANCHES_QUERY } from "../../lib/mutations";
import { cn } from "../../lib/utils";

interface BranchComboboxProps {
  repoId: string;
  /** Optional — if omitted, the server picks an available runtime for the repo. */
  runtimeInstanceId?: string;
  sessionGroupId?: string;
  value: string;
  onChange: (branch: string) => void;
}

export function BranchCombobox({
  repoId,
  runtimeInstanceId,
  sessionGroupId,
  value,
  onChange,
}: BranchComboboxProps) {
  const defaultBranch = useEntityField("repos", repoId, "defaultBranch");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus();
  }, []);

  useEffect(() => {
    if (!open) { setSearch(""); setError(null); return; }
    setLoading(true);
    setError(null);
    client
      .query(REPO_BRANCHES_QUERY, {
        repoId,
        runtimeInstanceId: runtimeInstanceId ?? null,
        sessionGroupId: sessionGroupId ?? null,
      })
      .toPromise()
      .then((result: { error?: unknown; data?: { repoBranches?: string[] } }) => {
        if (result.error) {
          setBranches([]);
          setError("Could not load branches");
        } else {
          setBranches(result.data?.repoBranches ?? []);
        }
      })
      .catch(() => {
        setBranches([]);
        setError("Could not load branches");
      })
      .finally(() => setLoading(false));
  }, [open, runtimeInstanceId, repoId, sessionGroupId]);

  const filtered = search
    ? branches.filter((b: string) => b.toLowerCase().includes(search.toLowerCase()))
    : branches;

  const displayValue = value || defaultBranch || "main";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm",
          "transition-colors hover:bg-input/50 dark:bg-input/30 dark:hover:bg-input/50",
          !value && "text-muted-foreground",
        )}
      >
        <span className="truncate">{displayValue}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <div className="flex items-center border-b border-border px-2">
          <input
            ref={inputRef}
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search branches..."
            className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {!loading && error && (
            <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {branches.length === 0 ? "No branches found" : "No matches"}
            </p>
          )}
          {filtered.map((branch: string) => (
            <button
              key={branch}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
                "hover:bg-accent hover:text-accent-foreground",
                value === branch && "bg-accent/50",
              )}
              onClick={() => {
                onChange(branch);
                setOpen(false);
              }}
            >
              <Check
                size={14}
                className={cn("shrink-0", value === branch ? "opacity-100" : "opacity-0")}
              />
              <span className="truncate">{branch}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
