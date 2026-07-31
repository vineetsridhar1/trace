import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LayoutTemplate, Search } from "lucide-react";
import { gql } from "@urql/core";
import {
  mergeSessionGroupEntity,
  useAuthStore,
  useEntityStore,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const HOME_DESIGNS_QUERY = gql`
  query HomeComposerDesigns($organizationId: ID!) {
    designSessionGroups(organizationId: $organizationId) {
      id
      name
      kind
      archivedAt
      designPreviewCommitSha
    }
  }
`;

export function HomeDesignPicker({
  selectedDesignId,
  disabled,
  onSelect,
}: {
  selectedDesignId: string | null;
  disabled: boolean;
  onSelect: (designId: string | null) => void;
}) {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const groups = useEntityStore((state) => state.sessionGroups);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const designs = useMemo(
    () =>
      Object.values(groups)
        .filter(
          (group) => group.kind === "design" && !group.archivedAt && !!group.designPreviewCommitSha,
        )
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .slice(0, 50),
    [groups],
  );
  const selected = designs.find((design) => design.id === selectedDesignId) ?? null;
  const visibleDesigns = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? designs.filter((design) => (design.name ?? "").toLowerCase().includes(normalized))
      : designs;
  }, [designs, query]);

  useEffect(() => {
    if (disabled || !activeOrgId) return;
    let active = true;
    void client
      .query(
        HOME_DESIGNS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "cache-and-network" },
      )
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        const incoming = (result.data?.designSessionGroups ?? []) as SessionGroupEntity[];
        const existing = useEntityStore.getState().sessionGroups;
        upsertMany(
          "sessionGroups",
          incoming.map((group) => mergeSessionGroupEntity(existing[group.id], group)),
        );
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, disabled, upsertMany]);

  if (disabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Attach a design"
        className={cn(
          "flex h-8 max-w-48 items-center gap-1.5 rounded-lg bg-transparent px-2 text-[13px]",
          "text-[var(--th-muted)] transition-colors hover:bg-[var(--th-surface-mid)] hover:text-[var(--th-heading)]",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <LayoutTemplate className="size-3.5 shrink-0" />
        <span className="truncate">{selected?.name ?? "Attach design"}</span>
        <ChevronDown className="size-3.5 shrink-0" />
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
              aria-label="Find a design"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a design…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--th-heading)] outline-none placeholder:text-[var(--th-muted)]"
            />
          </label>
        </div>
        <div role="listbox" aria-label="Design" className="max-h-72 overflow-y-auto p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-[var(--th-muted)]">Recent</p>
          {visibleDesigns.map((design) => (
            <button
              key={design.id}
              type="button"
              role="option"
              aria-selected={design.id === selectedDesignId}
              onClick={() => {
                onSelect(design.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                "outline-none hover:bg-[var(--th-surface-mid)] focus-visible:bg-[var(--th-surface-mid)]",
                design.id === selectedDesignId && "bg-[var(--th-surface-mid)]",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--th-surface-mid)] text-[var(--th-muted)]">
                <LayoutTemplate className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--th-heading)]">
                  {design.name}
                </span>
                <span className="block truncate text-[11.5px] text-[var(--th-muted)]">
                  Trace design
                </span>
              </span>
              {design.id === selectedDesignId ? (
                <kbd className="rounded border border-[var(--th-edge-strong)] px-1 text-[10px] text-[var(--th-muted)]">
                  ↵
                </kbd>
              ) : null}
            </button>
          ))}
          {visibleDesigns.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No saved designs yet
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
            Browse all designs
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
