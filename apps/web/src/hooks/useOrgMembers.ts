import { useEffect, useMemo, useRef } from "react";
import { gql } from "@urql/core";
import { client } from "../lib/urql";
import { useEntityStore, useEntityIds } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import type { User } from "@trace/gql";
import { useShallow } from "zustand/react/shallow";

const ORG_MEMBERS_QUERY = gql`
  query OrgMembers($id: ID!) {
    organization(id: $id) {
      id
      members {
        id
        name
        email
        avatarUrl
        role
      }
    }
  }
`;

/** Fetch org members into the entity store (once per org) and return them for mention autocomplete */
export function useOrgMembers(): Array<{ id: string; name: string; avatarUrl?: string | null }> {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeOrgId || fetchedRef.current === activeOrgId) return;
    fetchedRef.current = activeOrgId;

    client
      .query(ORG_MEMBERS_QUERY, { id: activeOrgId })
      .toPromise()
      .then((result) => {
        const members = result.data?.organization?.members as User[] | undefined;
        if (members) {
          const { upsertMany } = useEntityStore.getState();
          upsertMany("users", members);
        }
      });
  }, [activeOrgId]);

  const userIds = useEntityIds("users");
  const users = useEntityStore(
    useShallow((state) =>
      userIds
        .map((id) => state.users[id])
        .filter((user): user is User => Boolean(user)),
    ),
  );

  return useMemo(
    () =>
      users.map((user) => ({
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
      })),
    [users],
  );
}
