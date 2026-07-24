import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import {
  useAuthStore,
  useEntityStore,
  type SessionGroupEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { savedDesignPreviewUrl } from "./applications/saved-design-preview";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
} from "../ui/responsive-dialog";

const DESIGN_PICKER_QUERY = gql`
  query DesignPickerGroups($organizationId: ID!) {
    designSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      archivedAt
      designPreviewUrl
      gitCheckpoints {
        previewStatus
        previewUrl
        committedAt
      }
    }
  }
`;

const ATTACH_DESIGN_MUTATION = gql`
  mutation AttachDesignToSession($sessionId: ID!, $designSessionGroupId: ID!) {
    attachDesignToSession(sessionId: $sessionId, designSessionGroupId: $designSessionGroupId) {
      id
    }
  }
`;

export function DesignPickerDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const sessionGroups = useEntityStore((state) => state.sessionGroups);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activeOrgId) return;
    let active = true;
    void client
      .query(
        DESIGN_PICKER_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "cache-and-network" },
      )
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        const groups = (result.data?.designSessionGroups ?? []) as SessionGroupEntity[];
        if (groups.length > 0) upsertMany("sessionGroups", groups);
      });
    return () => {
      active = false;
    };
  }, [open, activeOrgId, upsertMany]);

  const designs = useMemo(
    () =>
      Object.values(sessionGroups)
        .filter((group) => group.kind === "design" && !group.archivedAt)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [sessionGroups],
  );

  const handleSelect = useCallback(
    async (groupId: string) => {
      if (attachingId) return;
      setAttachingId(groupId);
      try {
        const result = await client
          .mutation(ATTACH_DESIGN_MUTATION, { sessionId, designSessionGroupId: groupId })
          .toPromise();
        if (result.error) {
          toast.error("Couldn't attach design", { description: result.error.message });
          return;
        }
        onOpenChange(false);
      } finally {
        setAttachingId(null);
      }
    },
    [attachingId, sessionId, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Implement a design</DialogTitle>
          <DialogDescription>
            Pick a design to copy into this session. The agent gets the full source and builds from
            it.
          </DialogDescription>
        </DialogHeader>
        {designs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            <LayoutTemplate className="size-6" />
            <span>No designs yet. Create a design session first.</span>
          </div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {designs.map((group) => (
              <DesignPickerCard
                key={group.id}
                group={group}
                busy={attachingId === group.id}
                disabled={attachingId !== null}
                onSelect={() => handleSelect(group.id)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DesignPickerCard({
  group,
  busy,
  disabled,
  onSelect,
}: {
  group: SessionGroupEntity;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const previewUrl = savedDesignPreviewUrl(
    group.designPreviewUrl as string | null | undefined,
    group.gitCheckpoints,
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-surface-elevated text-left transition-colors hover:border-accent/40 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="aspect-[16/10] overflow-hidden bg-surface-deep">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title={`${group.name} preview`}
            loading="lazy"
            className="pointer-events-none size-full border-0 bg-background"
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <LayoutTemplate className="size-6" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <LayoutTemplate className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {group.name}
        </span>
        {busy && <span className="text-xs text-muted-foreground">Attaching…</span>}
      </div>
    </button>
  );
}
