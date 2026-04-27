import { useEffect, useRef, useState } from "react";
import type { User } from "@trace/gql";
import { client } from "../lib/urql";
import { ORG_MEMBERS_QUERY } from "@trace/client-core";
import { useEntityStore } from "@trace/client-core";
import { useAuthStore } from "@trace/client-core";

type OrgMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

const orgMemberCache = new Map<string, OrgMember[]>();

/** Fetch org members into the entity store (once per org) and return them for mention autocomplete */
export function useOrgMembers(): OrgMember[] {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const requestIdRef = useRef(0);
  const [members, setMembers] = useState<OrgMember[]>([]);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!activeOrgId) {
      setMembers([]);
      return;
    }

    const cached = orgMemberCache.get(activeOrgId);
    if (cached) {
      setMembers(cached);
    }

    if (!cached) {
      setMembers([]);
    }

    void client
      .query(ORG_MEMBERS_QUERY, { id: activeOrgId })
      .toPromise()
      .then(
        (result: {
          data?: {
            organization?: { members?: Array<{ user: User; role: string; joinedAt: string }> };
          };
        }) => {
          if (requestId !== requestIdRef.current) return;

          const rawMembers = result.data?.organization?.members;
          if (!rawMembers) return;

          const users = rawMembers.map((m) => m.user);
          useEntityStore.getState().upsertMany("users", users);

          const scopedMembers = users.map((user) => ({
            id: user.id,
            name: user.name,
            avatarUrl: user.avatarUrl,
          }));

          orgMemberCache.set(activeOrgId, scopedMembers);
          setMembers(scopedMembers);
        },
      )
      .catch(() => {
        if (requestId !== requestIdRef.current || cached) return;
        setMembers([]);
      });
  }, [activeOrgId]);

  return members;
}
