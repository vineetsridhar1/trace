import { cn } from "../../lib/utils";
import { HOME_CREATE_KIND_OPTIONS, homeKindLabel } from "./HomeKindIcon";
import type { HomeCreatableKind } from "./home-kinds";

export function HomeKindSelector({
  activeKind,
  hasPrompt,
  manuallySelected,
  onSelect,
}: {
  activeKind: HomeCreatableKind | null;
  hasPrompt: boolean;
  manuallySelected: boolean;
  onSelect: (kind: HomeCreatableKind) => void;
}) {
  return (
    <>
      <div className="mt-5 flex max-w-full flex-wrap justify-center gap-2 px-1">
        {HOME_CREATE_KIND_OPTIONS.map(({ kind, label, Icon }) => {
          const active = kind === activeKind;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(kind)}
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
      {hasPrompt && (
        <p className="mt-2.5 min-h-4 text-center text-xs text-[var(--th-muted)]">
          {!activeKind ? (
            "Select a kind to route this session"
          ) : (
            <>
              {manuallySelected ? "Manually routed" : "Routed automatically"} — this opens a{" "}
              <span className="text-[var(--th-accent-light)]">{homeKindLabel(activeKind)}</span>{" "}
              session
            </>
          )}
        </p>
      )}
    </>
  );
}
