import { useEffect, useMemo } from "react";
import { Check, ChevronDown, LayoutTemplate } from "lucide-react";
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
    <Popover>
      <PopoverTrigger
        aria-label="Attach a design"
        className={cn(
          "flex h-7 max-w-40 items-center gap-1.5 rounded-lg bg-transparent px-2 text-[11px]",
          "text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <LayoutTemplate className="size-3.5 shrink-0" />
        <span className="truncate">{selected?.name ?? "Attach design"}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 overflow-hidden p-1.5">
        <div role="listbox" aria-label="Design" className="max-h-64 space-y-0.5 overflow-y-auto">
          {designs.map((design) => (
            <button
              key={design.id}
              type="button"
              role="option"
              aria-selected={design.id === selectedDesignId}
              onClick={() => onSelect(design.id === selectedDesignId ? null : design.id)}
              className={cn(
                "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                "text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground",
                design.id === selectedDesignId && "bg-white/10 text-foreground",
              )}
            >
              <LayoutTemplate className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{design.name}</span>
              {design.id === selectedDesignId ? <Check className="size-3.5 shrink-0" /> : null}
            </button>
          ))}
          {designs.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No saved designs yet
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
