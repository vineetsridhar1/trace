import { useMemo, useState } from "react";
import { Check, ChevronDown, FolderKanban, Hash, Search } from "lucide-react";
import type { Channel, Project } from "@trace/gql";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface HomeChannelTarget {
  key: string;
  channel: Channel | null;
  projectId: string | null;
  repoId: string | null;
  label: string;
}

const MAX_VISIBLE_TARGETS = 50;

export function buildHomeChannelTargets(
  channels: Channel[],
  projects: Project[],
): HomeChannelTarget[] {
  const targets: HomeChannelTarget[] = [];
  for (const channel of channels) {
    if (channel.type !== "coding") continue;
    targets.push({
      key: `channel:${channel.id}`,
      channel,
      projectId: null,
      repoId: channel.repo?.id ?? null,
      label: channel.name,
    });
  }
  for (const project of projects) {
    if (!project.repo) continue;
    targets.push({
      key: `project:${project.id}`,
      channel: null,
      projectId: project.id,
      repoId: project.repo?.id ?? null,
      label: project.name,
    });
  }
  return targets.sort((a, b) => a.label.localeCompare(b.label));
}

export function HomeChannelPicker({
  channels,
  projects,
  selectedKey,
  disabled,
  onSelect,
}: {
  channels: Channel[];
  projects: Project[];
  selectedKey: string | null;
  disabled: boolean;
  onSelect: (target: HomeChannelTarget | null) => void;
}) {
  const [query, setQuery] = useState("");
  const targets = useMemo(() => buildHomeChannelTargets(channels, projects), [channels, projects]);
  const selected = targets.find((target) => target.key === selectedKey) ?? null;
  const visibleTargets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? targets.filter((target) => target.label.toLowerCase().includes(normalized))
      : targets;
    return filtered.slice(0, MAX_VISIBLE_TARGETS);
  }, [query, targets]);

  if (disabled) return null;

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Choose channel or project"
        className={cn(
          "flex h-7 max-w-48 items-center gap-1.5 rounded-lg bg-transparent px-2 text-[11px]",
          "text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <FolderKanban className="size-3.5 shrink-0" />
        <span className="truncate">{selected?.label ?? "Channel / project"}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-0">
        <label className="flex h-10 items-center gap-2 border-b border-border px-3">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            aria-label="Find a channel or project"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a channel or project…"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div
          role="listbox"
          aria-label="Channel or project"
          className="max-h-64 overflow-y-auto p-1.5"
        >
          {visibleTargets.map((target) => (
            <button
              key={target.key}
              type="button"
              role="option"
              aria-selected={target.key === selectedKey}
              onClick={() => onSelect(target.key === selectedKey ? null : target)}
              className={cn(
                "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                "text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground",
                target.key === selectedKey && "bg-white/10 text-foreground",
              )}
            >
              <Hash className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{target.label}</span>
              {target.key === selectedKey ? <Check className="size-3.5 shrink-0" /> : null}
            </button>
          ))}
          {visibleTargets.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">
              No coding channels or projects found
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
