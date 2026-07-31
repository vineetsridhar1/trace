import { useMemo, useState } from "react";
import { ChevronDown, Folder, Search } from "lucide-react";
import type { Channel, Project } from "@trace/gql";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface HomeChannelTarget {
  key: string;
  channel: Channel | null;
  projectId: string | null;
  repoId: string | null;
  label: string;
  context: string;
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
      context: channel.repo?.name ? `Coding channel · ${channel.repo.name}` : "Coding channel",
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
      context: project.repo?.name ? `Project · ${project.repo.name}` : "Project",
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
          "flex h-8 max-w-52 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] leading-none",
          selected
            ? "border-[var(--th-edge-strong)] text-[var(--th-heading)]"
            : "border-dashed border-[var(--th-edge-strong)] text-[var(--th-muted)]",
          "transition-colors hover:border-[var(--th-edge-hover)] hover:bg-[var(--th-surface-mid)]",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <span className="text-[var(--th-muted)]">Project</span>
        <span className="truncate font-medium">{selected?.label ?? "Select…"}</span>
        <ChevronDown className="size-3 shrink-0 text-[var(--th-muted)]" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[340px] gap-0 overflow-hidden rounded-xl border border-[var(--th-edge-strong)] bg-[var(--th-raised)] p-0 shadow-[0_20px_64px_rgb(0_0_0/0.34)] ring-0"
      >
        <div className="border-b border-[var(--th-edge-strong)] p-2">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-[var(--th-surface-mid)] px-3 text-[var(--th-muted)]">
            <Search className="size-3.5 shrink-0" />
            <input
              autoFocus
              aria-label="Find a project"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a project…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--th-heading)] outline-none placeholder:text-[var(--th-muted)]"
            />
          </label>
        </div>
        <div
          role="listbox"
          aria-label="Choose a project"
          className="max-h-72 overflow-y-auto p-1.5"
        >
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-[var(--th-muted)]">Recent</p>
          {visibleTargets.map((target) => (
            <button
              key={target.key}
              type="button"
              role="option"
              aria-selected={target.key === selectedKey}
              onClick={() => onSelect(target)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                "outline-none hover:bg-[var(--th-surface-mid)] focus-visible:bg-[var(--th-surface-mid)]",
                target.key === selectedKey && "bg-[var(--th-surface-mid)]",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--th-surface-mid)] text-[var(--th-muted)]">
                <Folder className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--th-heading)]">
                  {target.label}
                </span>
                <span className="block truncate text-[11.5px] text-[var(--th-muted)]">
                  {target.context}
                </span>
              </span>
              {target.key === selectedKey ? (
                <kbd className="rounded border border-[var(--th-edge-strong)] px-1 text-[10px] text-[var(--th-muted)]">
                  ↵
                </kbd>
              ) : null}
            </button>
          ))}
          {visibleTargets.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-[var(--th-muted)]">
              No coding channels or projects found
            </p>
          ) : null}
        </div>
        <div className="flex h-10 items-center justify-between border-t border-[var(--th-edge-strong)] px-3">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--th-muted)]">
            <kbd className="rounded border border-[var(--th-edge-strong)] px-1 text-[10px]">↑</kbd>
            <kbd className="rounded border border-[var(--th-edge-strong)] px-1 text-[10px]">↓</kbd>
            to navigate
          </span>
          <span className="text-[12px] font-medium text-[var(--th-heading)]">
            Browse all projects
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
