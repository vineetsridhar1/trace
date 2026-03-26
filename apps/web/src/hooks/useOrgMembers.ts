import { useEffect, useRef, useState } from "react";
import type { User } from "@trace/gql";
import { client } from "../lib/urql";
import { ORG_MEMBERS_QUERY } from "../lib/mutations";
import { useEntityStore } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

type OrgMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

const orgMemberCache = new Map<string, OrgMember[]>();

/** Fetch org members into the entity store (once per org) and return them for mention autocomplete */
export function useOrgMembers(): OrgMember[] {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
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
      .then((result) => {
        if (requestId !== requestIdRef.current) return;

        const rawMembers = result.data?.organization?.members as
          | Array<{ user: User; role: string; joinedAt: string }>
          | undefined;
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
      })
      .catch(() => {
        if (requestId !== requestIdRef.current || cached) return;
        setMembers([]);
      });
  }, [activeOrgId]);

  return members;
}
