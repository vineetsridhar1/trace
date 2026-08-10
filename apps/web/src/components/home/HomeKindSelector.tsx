import { cn } from "../../lib/utils";
import { HOME_SELECTABLE_KIND_OPTIONS } from "./HomeKindIcon";
import type { HomeCreatableKind } from "./home-kinds";

export function HomeKindSelector({
  selectedKind,
  onSelect,
}: {
  selectedKind: HomeCreatableKind | null;
  onSelect: (kind: HomeCreatableKind | null) => void;
}) {
  return (
    <div className="mt-5 flex max-w-full flex-wrap justify-center gap-2 px-1">
      {HOME_SELECTABLE_KIND_OPTIONS.map(({ kind, label, Icon }) => {
        const active = kind === selectedKind;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : (kind as HomeCreatableKind))}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-all",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]",
              active
                ? "border-[var(--th-heading)] bg-[var(--th-raised)] text-[var(--th-heading)]"
                : "border-[var(--th-edge-strong)] text-[var(--th-muted)] hover:border-[var(--th-edge-hover)] hover:bg-[var(--th-raised)] hover:text-[var(--th-primary)]",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
