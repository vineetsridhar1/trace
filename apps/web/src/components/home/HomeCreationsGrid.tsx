import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import { Input } from "../ui/input";
import { cn, timeAgo } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { HomeKindIcon, homeKindLabel } from "./HomeKindIcon";
import type { GeneratedProjectKind } from "../sidebar/generated-project-types";
import { designPreviewModeUrl } from "../session/applications/saved-design-preview";

const CREATION_TYPES: Array<{ id: "all" | GeneratedProjectKind; label: string }> = [
  { id: "all", label: "All" },
  { id: "app", label: "Apps" },
  { id: "design", label: "Designs" },
  { id: "design_system", label: "Design systems" },
  { id: "pdf", label: "Documents" },
  { id: "animation", label: "Animations" },
];

export function HomeCreationsGrid() {
  const [type, setType] = useState<(typeof CREATION_TYPES)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionGroups = useEntityStore((state) => state.sessionGroups);
  const creations = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return Object.values(sessionGroups)
      .filter(
        (group) =>
          isCreation(group) &&
          (type === "all" || group.kind === type) &&
          (!normalizedSearch ||
            `${group.name ?? ""} ${group.slug ?? ""}`.toLocaleLowerCase().includes(normalizedSearch)),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [search, sessionGroups, type]);
  const virtualizer = useVirtualizer({
    count: Math.ceil(creations.length / 2),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 112,
    overscan: 4,
  });

  return (
    <section className="mx-auto mt-10 w-full max-w-[720px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold text-[var(--th-heading)]">Your creations</h2>
          <p className="mt-0.5 text-xs text-[var(--th-muted)]">Browse and continue previous work.</p>
        </div>
        <div className="relative sm:ml-auto sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--th-muted)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search creations"
            aria-label="Search creations"
            className="h-8 border-[var(--th-edge)] bg-[var(--th-surface)] pl-8 text-xs"
          />
        </div>
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {CREATION_TYPES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setType(option.id)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              type === option.id
                ? "border-transparent bg-white/10 text-[var(--th-heading)]"
                : "border-[var(--th-edge)] text-[var(--th-muted)] hover:text-[var(--th-primary)]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {creations.length === 0 ? (
        <div className="mt-3 flex h-28 items-center justify-center rounded-[10px] border border-dashed border-[var(--th-edge)] text-xs text-[var(--th-muted)]">
          No creations match your search.
        </div>
      ) : (
        <div ref={scrollRef} className="no-scrollbar mt-3 max-h-[456px] overflow-y-auto">
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const rowItems = creations.slice(virtualRow.index * 2, virtualRow.index * 2 + 2);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 grid w-full grid-cols-2 gap-3 pb-3"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {rowItems.map((group) => (
                    <CreationCard key={group.id} group={group} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function CreationCard({ group }: { group: SessionGroupEntity }) {
  const title = group.name || group.slug || "Untitled creation";
  const designPreviewUrl = group.designPreviewUrl as string | null | undefined;
  const animationPreviewUrl = group.animationPreviewUrl as string | null | undefined;
  const previewUrl = designPreviewUrl
    ? designPreviewModeUrl(designPreviewUrl)
    : (animationPreviewUrl ?? null);
  return (
    <button
      type="button"
      onClick={() => navigateToSessionGroup(group.channel?.id ?? null, group.id)}
      className="flex min-h-24 flex-col overflow-hidden rounded-[10px] border border-[var(--th-edge)] bg-[var(--th-surface)] text-left transition-colors hover:border-[var(--th-edge-hover)] hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]"
    >
      {previewUrl ? (
        <div className="h-28 overflow-hidden border-b border-[var(--th-edge-faint)] bg-[var(--th-surface-mid)]">
          <iframe
            src={previewUrl}
            title={`${title} preview`}
            tabIndex={-1}
            sandbox={designPreviewUrl ? "allow-forms allow-modals allow-popups allow-scripts" : "allow-scripts"}
            className="pointer-events-none size-full border-0"
          />
        </div>
      ) : null}
      <div className="flex min-h-24 flex-col p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--th-muted)]">
          <HomeKindIcon kind={group.kind} className="size-4" />
          <span>{homeKindLabel(group.kind)}</span>
        </div>
        <span className="mt-3 truncate text-sm font-medium text-[var(--th-heading)]">{title}</span>
        <span className="mt-auto pt-2 text-[11px] text-[var(--th-muted)]">
          Updated {timeAgo(group.updatedAt)}
        </span>
      </div>
    </button>
  );
}

function isCreation(
  group: SessionGroupEntity,
): group is SessionGroupEntity & { kind: GeneratedProjectKind } {
  return (
    group.kind === "app" ||
    group.kind === "design" ||
    group.kind === "design_system" ||
    group.kind === "pdf" ||
    group.kind === "animation"
  );
}
