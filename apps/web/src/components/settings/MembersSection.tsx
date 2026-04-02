import { useEffect, useCallback, useState } from "react";
import { UserPlus, Trash2, Shield, ShieldCheck } from "lucide-react";
import type { UserRole } from "@trace/gql";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { ORG_MEMBERS_QUERY } from "../../lib/mutations";
import { getInitials } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

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

// Search users by email to add them
const SEARCH_USERS_QUERY = gql`
  query SearchUsers($email: String!) {
    searchUsers(email: $email) {
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
  observer: { label: "Observer", icon: Shield },
};

export function MembersSection() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<UserRole>("member");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    const result = await client
      .query(ORG_MEMBERS_QUERY, { id: activeOrgId })
      .toPromise();
    const rawMembers = result.data?.organization?.members as Member[] | undefined;
    setMembers(rawMembers ?? []);
    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Debounced search
  useEffect(() => {
    const trimmed = addEmail.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchDone(false);
      return;
    }
    setSearchDone(false);
    const timer = setTimeout(async () => {
      setSearching(true);
      const result = await client
        .query(SEARCH_USERS_QUERY, { email: trimmed })
        .toPromise();
      const users = (result.data?.searchUsers ?? []) as SearchUser[];
      // Filter out users already in the org
      const memberIds = new Set(members.map((m) => m.user.id));
      setSearchResults(users.filter((u) => !memberIds.has(u.id)));
      setSearching(false);
      setSearchDone(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [addEmail, members]);

  async function handleAddMember(userId: string) {
    if (!activeOrgId) return;
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
      setAddEmail("");
      setSearchResults([]);
      fetchMembers();
    }
    setAdding(false);
  }

  async function handleRemoveMember(userId: string) {
    if (!activeOrgId) return;
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
    if (!activeOrgId) return;
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
        <p className="text-sm text-muted-foreground">
          Manage who has access to your organization.
        </p>
      </div>

      {/* Add member */}
      <div className="mb-6 rounded-lg border border-border bg-surface-deep p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Add a member</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search by email..."
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
            />
            {/* Search results dropdown */}
            {addEmail.trim().length >= 2 && (searching || searchDone) && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-border bg-surface-elevated shadow-lg">
                {searching ? (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    Searching...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <button
                      key={user.id}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover transition-colors first:rounded-t-lg last:rounded-b-lg"
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
                    No users found. They need to sign up first.
                  </div>
                )}
              </div>
            )}
          </div>
          <Select value={addRole} onValueChange={(v) => setAddRole(v as UserRole)}>
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
        {addError && (
          <p className="mt-2 text-xs text-destructive">{addError}</p>
        )}
      </div>

      {actionError && (
        <p className="mb-4 text-xs text-destructive">{actionError}</p>
      )}

      {/* Members table */}
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
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_140px_48px] gap-4 border-b border-border bg-surface-deep px-4 py-2.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Joined</span>
            <span />
          </div>
          {/* Table rows */}
          {members.map((member) => {
            const isCurrentUser = member.user.id === currentUserId;
            const roleMeta = ROLE_LABELS[member.role] ?? ROLE_LABELS.member;
            return (
              <div
                key={member.user.id}
                className="grid grid-cols-[1fr_140px_140px_48px] gap-4 items-center border-b border-border last:border-b-0 px-4 py-3 hover:bg-surface-hover/50 transition-colors"
              >
                {/* User info */}
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

                {/* Role */}
                <div>
                  {isCurrentUser ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <roleMeta.icon size={14} />
                      {roleMeta.label}
                    </span>
                  ) : (
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member.user.id, v as UserRole)}
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

                {/* Joined date */}
                <span className="text-sm text-muted-foreground">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </span>

                {/* Remove button */}
                <div className="flex justify-end">
                  {!isCurrentUser && (
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
