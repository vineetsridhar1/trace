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
      <div className="mt-3.5 flex max-w-full flex-wrap justify-center gap-1.5 px-1">
        {HOME_CREATE_KIND_OPTIONS.map(({ kind, label, Icon }) => {
          const active = kind === activeKind;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(kind)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)]",
                active
                  ? "border-[color-mix(in_srgb,var(--th-accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--th-accent)_13%,transparent)] text-[var(--th-accent-light)] shadow-[0_0_18px_color-mix(in_srgb,var(--th-accent)_12%,transparent)]"
                  : "border-[var(--th-edge)] text-[var(--th-muted)] hover:border-[var(--th-edge-hover)] hover:text-[var(--th-primary)]",
              )}
            >
              <Icon className="size-3" aria-hidden="true" />
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
