import { useEffect, useCallback, useState } from "react";
import { UserPlus, Trash2, Shield, ShieldCheck, Eye } from "lucide-react";
import type { UserRole } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { ORG_MEMBERS_QUERY } from "@trace/client-core";
import { getInitials } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const ADD_ORG_MEMBER = gql`
  mutation AddOrgMember($organizationId: ID!, $userId: ID!, $role: UserRole) {
    addOrgMember(organizationId: $organizationId, userId: $userId, role: $role) {
      user {
        id
        name
        email
        avatarUrl
      }
      role
      joinedAt
    }
  }
`;

const REMOVE_ORG_MEMBER = gql`
  mutation RemoveOrgMember($organizationId: ID!, $userId: ID!) {
    removeOrgMember(organizationId: $organizationId, userId: $userId)
  }
`;

const UPDATE_ORG_MEMBER_ROLE = gql`
  mutation UpdateOrgMemberRole($organizationId: ID!, $userId: ID!, $role: UserRole!) {
    updateOrgMemberRole(organizationId: $organizationId, userId: $userId, role: $role) {
      user {
        id
      }
      role
    }
  }
`;

// Search users by name or email to add them
const SEARCH_USERS_QUERY = gql`
  query SearchUsers($query: String!) {
    searchUsers(query: $query) {
      id
      name
      email
      avatarUrl
    }
  }
`;

interface Member {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
  role: string;
  joinedAt: string;
}

interface SearchUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

const ROLE_LABELS: Record<string, { label: string; icon: typeof Shield }> = {
  admin: { label: "Admin", icon: ShieldCheck },
  member: { label: "Member", icon: Shield },
  observer: { label: "Observer", icon: Eye },
};

export function MembersSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const currentUserId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);
  const orgMemberships = useAuthStore((s: { orgMemberships: Array<{ organizationId: string; role: string }> }) => s.orgMemberships);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addRole, setAddRole] = useState<UserRole>("member");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeMembership = orgMemberships.find(
    (membership: { organizationId: string; role: string }) => membership.organizationId === activeOrgId,
  );
  const canManageMembers = activeMembership?.role === "admin";

  const fetchMembers = useCallback(async () => {
    if (!activeOrgId) {
      setMembers([]);
      setLoading(false);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const result = await client.query(ORG_MEMBERS_QUERY, { id: activeOrgId }).toPromise();

      if (result.error) {
        setLoadError(result.error.message);
        setMembers([]);
        return;
      }

      const rawMembers = result.data?.organization?.members as Member[] | undefined;
      setMembers(rawMembers ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load members");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Debounced search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!canManageMembers || trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setSearchDone(false);
      return;
    }

    setSearchDone(false);
    let cancelled = false;

    const timer = setTimeout(async () => {
      setSearching(true);
      setAddError(null);

      try {
        const result = await client.query(SEARCH_USERS_QUERY, { query: trimmed }).toPromise();

        if (result.error) {
          if (cancelled) return;
          setAddError(result.error.message);
          setSearchResults([]);
          return;
        }

        if (cancelled) return;
        const users = (result.data?.searchUsers ?? []) as SearchUser[];
        setSearchResults(users);
      } catch (error) {
        if (cancelled) return;
        setAddError(error instanceof Error ? error.message : "Failed to search users");
        setSearchResults([]);
      } finally {
        if (cancelled) return;
        setSearching(false);
        setSearchDone(true);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canManageMembers, searchQuery]);

  async function handleAddMember(userId: string) {
    if (!activeOrgId || !canManageMembers) return;
    setAdding(true);
    setAddError(null);
    const result = await client
      .mutation(ADD_ORG_MEMBER, {
        organizationId: activeOrgId,
        userId,
        role: addRole,
      })
      .toPromise();
    if (result.error) {
      setAddError(result.error.message);
    } else {
      setSearchQuery("");
      setSearchResults([]);
      setSearchDone(false);
      fetchMembers();
    }
    setAdding(false);
  }

  async function handleRemoveMember(userId: string) {
    if (!activeOrgId || !canManageMembers) return;
    setRemovingId(userId);
    setActionError(null);
    const result = await client
      .mutation(REMOVE_ORG_MEMBER, { organizationId: activeOrgId, userId })
      .toPromise();
    if (result.error) {
      setActionError(result.error.message);
    } else {
      fetchMembers();
    }
    setRemovingId(null);
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    if (!activeOrgId || !canManageMembers) return;
    setActionError(null);
    const result = await client
      .mutation(UPDATE_ORG_MEMBER_ROLE, {
        organizationId: activeOrgId,
        userId,
        role,
      })
      .toPromise();
    if (result.error) {
      setActionError(result.error.message);
    } else {
      fetchMembers();
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Members</h2>
        <p className="text-sm text-muted-foreground">Manage who has access to your organization.</p>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-surface-deep p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Add a member</span>
        </div>
        {canManageMembers ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              />
              {searchQuery.trim().length >= 2 && (searching || searchDone) && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-border bg-surface-elevated shadow-lg">
                  {searching ? (
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((user: SearchUser) => (
                      <button
                        key={user.id}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-surface-hover"
                        onClick={() => handleAddMember(user.id)}
                        disabled={adding}
                      >
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="h-7 w-7 rounded-full"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {getInitials(user.name)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">{user.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      No eligible users found. They need to sign up first.
                    </div>
                  )}
                </div>
              )}
            </div>
            <Select value={addRole} onValueChange={(value: string | null) => { if (value) setAddRole(value as UserRole); }}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="observer">Observer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only organization admins can add members or change roles.
          </p>
        )}
        {addError && <p className="mt-2 text-xs text-destructive">{addError}</p>}
      </div>

      {loadError && <p className="mb-4 text-xs text-destructive">{loadError}</p>}

      {actionError && <p className="mb-4 text-xs text-destructive">{actionError}</p>}

      {loading ? (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading members...</p>
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">No members yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_140px_110px_48px] gap-4 border-b border-border bg-surface-deep px-4 py-2.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              User
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Role
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Joined
            </span>
            <span />
          </div>
          {members.map((member: Member) => {
            const isCurrentUser = member.user.id === currentUserId;
            const roleMeta = ROLE_LABELS[member.role] ?? ROLE_LABELS.member;
            return (
              <div
                key={member.user.id}
                className="grid grid-cols-[minmax(0,1fr)_140px_110px_48px] gap-4 items-center border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-hover/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {member.user.avatarUrl ? (
                    <img
                      src={member.user.avatarUrl}
                      alt={member.user.name}
                      className="h-8 w-8 shrink-0 rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {getInitials(member.user.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {member.user.name}
                      {isCurrentUser && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>

                <div>
                  {isCurrentUser || !canManageMembers ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <roleMeta.icon size={14} />
                      {roleMeta.label}
                    </span>
                  ) : (
                    <Select
                      value={member.role}
                      onValueChange={(v: string | null) => { if (v) handleRoleChange(member.user.id, v as UserRole); }}
                    >
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="observer">Observer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <span className="text-sm text-muted-foreground">
                  {new Date(member.joinedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>

                <div className="flex justify-end">
                  {canManageMembers && !isCurrentUser && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveMember(member.user.id)}
                      disabled={removingId === member.user.id}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
