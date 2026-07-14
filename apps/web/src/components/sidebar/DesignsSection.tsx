import { useEffect, useMemo } from "react";
import { Figma, Plus } from "lucide-react";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import { useEntityStore, type SessionEntity, type SessionGroupEntity } from "@trace/client-core";
import { client } from "../../lib/urql";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { GeneratedProjectSessionItem } from "./GeneratedProjectSessionItem";

const DESIGN_SESSION_GROUPS_QUERY = gql`
  query DesignSessionGroups($organizationId: ID!) {
    designSessionGroups(organizationId: $organizationId) {
      id
      name
      slug
      kind
      status
      visibility
      archivedAt
      connection {
        state
      }
      sessions {
        id
        sessionGroupId
        agentStatus
        sessionStatus
        prUrl
        worktreeDeleted
        lastMessageAt
        lastUserMessageAt
        updatedAt
        createdAt
      }
    }
  }
`;

export function DesignsSection({
  activeOrgId,
  activeSessionGroupId,
}: {
  activeOrgId: string | null;
  activeSessionGroupId: string | null;
}) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const setOpen = useCommandPaletteStore((state) => state.setNewDesignSessionOpen);
  const sessionGroups = useEntityStore((state) => state.sessionGroups);

  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void client
      .query(
        DESIGN_SESSION_GROUPS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "cache-and-network" },
      )
      .toPromise()
      .then((result) => {
        if (!active) return;
        const groups = (result.data?.designSessionGroups ?? []) as Array<
          SessionGroup & { id: string; sessions?: Array<Session & { id: string }> }
        >;
        if (groups.length === 0) return;
        upsertMany("sessionGroups", groups as SessionGroupEntity[]);
        const sessions = groups.flatMap((group) => group.sessions ?? []);
        if (sessions.length > 0) upsertMany("sessions", sessions as SessionEntity[]);
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, upsertMany]);

  const designs = useMemo(
    () =>
      Object.values(sessionGroups)
        .filter((group) => group.kind === "design" && !group.archivedAt)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [sessionGroups],
  );

  return (
    <div className="pt-2">
      <div className="group/designs-header flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Designs
        </span>
        <button
          type="button"
          title="New design"
          aria-label="New design"
          onClick={() => setOpen(true)}
          className="pointer-events-none flex size-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring group-hover/designs-header:pointer-events-auto group-hover/designs-header:opacity-100 group-focus-within/designs-header:pointer-events-auto group-focus-within/designs-header:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>
      {designs.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-4 text-sm text-muted-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Figma size={16} />
          <span>Create a Design</span>
        </button>
      ) : (
        <div className="mt-1 space-y-0.5">
          {designs.map((group) => (
            <GeneratedProjectSessionItem
              key={group.id}
              groupId={group.id}
              isActive={group.id === activeSessionGroupId}
              kind="design"
            />
          ))}
        </div>
      )}
    </div>
  );
}
