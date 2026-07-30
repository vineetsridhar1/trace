import { useMemo, useState } from "react";
import { Check, ChevronDown, GitBranch, Plus, Search } from "lucide-react";
import type { Repo } from "@trace/gql";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function HomeRepoPicker({
  repos,
  selectedRepoId,
  disabled,
  onSelect,
}: {
  repos: Repo[];
  selectedRepoId: string | null;
  disabled: boolean;
  onSelect: (repoId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const setActivePage = useUIStore((state) => state.setActivePage);
  const setSettingsInitialTab = useUIStore((state) => state.setSettingsInitialTab);
  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId) ?? null;
  const visibleRepos = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? repos.filter((repo) => repoLabel(repo).toLowerCase().includes(normalized))
      : repos;
  }, [query, repos]);

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-[var(--th-edge)] bg-[var(--th-surface)] px-2.5 text-xs text-[var(--th-faint)]"
      >
        <GitBranch className="size-3.5" />
        No repo needed
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-7 max-w-44 items-center gap-1.5 rounded-md border border-[var(--th-edge)]",
          "bg-[var(--th-surface)] px-2.5 text-xs text-[var(--th-primary)]",
          "transition-colors hover:border-[var(--th-edge-hover)] focus-visible:outline-2",
          "focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]",
          repos.length === 0 && "border-dashed",
        )}
      >
        <GitBranch className="size-3.5 shrink-0" />
        <span className="truncate">
          {selectedRepo
            ? repoLabel(selectedRepo)
            : repos.length === 0
              ? "Connect repo"
              : "Choose repo"}
        </span>
        <ChevronDown className="size-3 shrink-0 text-[var(--th-faint)]" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(300px,calc(100vw-2rem))] gap-0 overflow-hidden border border-[var(--th-edge-strong)] bg-[var(--th-raised)] p-0 shadow-[0_16px_48px_rgb(0_0_0/0.55)]"
      >
        <label className="flex h-10 items-center gap-2 border-b border-[var(--th-edge)] px-3">
          <Search className="size-3.5 text-[var(--th-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a repo…"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-[var(--th-faint)]"
          />
        </label>
        <RepoSection
          label="GitHub"
          repos={visibleRepos.filter((repo) => repo.provider === "github")}
          selectedRepoId={selectedRepoId}
          onSelect={onSelect}
        />
        <RepoSection
          label="Managed by Trace"
          repos={visibleRepos.filter((repo) => repo.provider === "managed")}
          selectedRepoId={selectedRepoId}
          onSelect={onSelect}
        />
        {visibleRepos.length === 0 && (
          <p className="px-3 py-5 text-center text-xs text-[var(--th-muted)]">No repos found</p>
        )}
        <button
          type="button"
          onClick={() => {
            setSettingsInitialTab("repositories");
            setActivePage("settings");
          }}
          className="flex w-full items-center gap-2 border-t border-[var(--th-edge)] px-3 py-2.5 text-left text-xs text-[var(--th-accent-light)] hover:bg-white/[0.04]"
        >
          <Plus className="size-3.5" />
          Connect repo
        </button>
      </PopoverContent>
    </Popover>
  );
}

function RepoSection({
  label,
  repos,
  selectedRepoId,
  onSelect,
}: {
  label: string;
  repos: Repo[];
  selectedRepoId: string | null;
  onSelect: (repoId: string | null) => void;
}) {
  if (repos.length === 0) return null;
  return (
    <div className="py-1.5">
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--th-faint)]">
        {label}
      </p>
      {repos.map((repo) => (
        <button
          key={repo.id}
          type="button"
          onClick={() => onSelect(repo.id === selectedRepoId ? null : repo.id)}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.04]",
            repo.id === selectedRepoId && "bg-[var(--th-accent-tint)]",
          )}
        >
          <span className="flex size-4 shrink-0 items-center justify-center rounded bg-[var(--th-surface-elevated)] text-[9px] font-semibold uppercase text-foreground">
            {repoLabel(repo).slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{repoLabel(repo)}</span>
          <span className="max-w-20 truncate text-[11px] text-[var(--th-faint)]">
            {repo.defaultBranch || "no remote"}
          </span>
          {repo.id === selectedRepoId && (
            <Check className="size-3.5 shrink-0 text-[var(--th-accent-light)]" />
          )}
        </button>
      ))}
    </div>
  );
}

function repoLabel(repo: Repo): string {
  const remoteName = repo.remoteUrl
    ?.replace(/\.git$/i, "")
    .split("/")
    .pop();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(repo.name) && remoteName ? remoteName : repo.name;
}
