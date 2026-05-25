import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { UserPlus, Users } from "lucide-react";
import { gql } from "@urql/core";
import { ORG_MEMBERS_QUERY, useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";

const CHANNEL_MEMBERS_QUERY = gql`
  query ChannelMembers($id: ID!) {
    channel(id: $id) {
      id
      members {
        user {
          id
          name
          email
          avatarUrl
        }
      }
    }
  }
`;

const ADD_CHANNEL_MEMBER_MUTATION = gql`
  mutation AddChannelMember($input: AddChannelMemberInput!) {
    addChannelMember(input: $input) {
      id
    }
  }
`;

interface OrgMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

function MemberAvatar({ member }: { member: OrgMember }) {
  if (member.avatarUrl) {
    return <img src={member.avatarUrl} alt="" className="h-8 w-8 rounded-full" />;
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
      {member.name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function MemberRow({ member, action }: { member: OrgMember; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5">
      <MemberAvatar member={member} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{member.name}</div>
        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
      </div>
      {action}
    </div>
  );
}

export function ChannelMembersDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [channelMembers, setChannelMembers] = useState<OrgMember[]>([]);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const userId = useAuthStore((s) => s.user?.id);

  const fetchMembers = useCallback(async () => {
    if (!activeOrgId) return;
    const [orgResult, channelResult] = await Promise.all([
      client.query(ORG_MEMBERS_QUERY, { id: activeOrgId }).toPromise(),
      client.query(CHANNEL_MEMBERS_QUERY, { id: channelId }).toPromise(),
    ]);

    if (orgResult.data?.organization?.members) {
      const rawMembers = orgResult.data.organization.members as Array<{ user: OrgMember }>;
      setOrgMembers(rawMembers.map((member) => member.user));
    }

    const rawChannelMembers = channelResult.data?.channel?.members as
      | Array<{ user: OrgMember }>
      | undefined;
    setChannelMembers(rawChannelMembers?.map((member) => member.user) ?? []);
  }, [activeOrgId, channelId]);

  useEffect(() => {
    if (open) void fetchMembers();
  }, [open, fetchMembers]);

  const channelMemberIds = useMemo(
    () => new Set(channelMembers.map((member) => member.id)),
    [channelMembers],
  );
  const availableMembers = useMemo(
    () => orgMembers.filter((member) => member.id !== userId && !channelMemberIds.has(member.id)),
    [channelMemberIds, orgMembers, userId],
  );

  async function handleAdd(targetUserId: string) {
    setAddingUserId(targetUserId);
    setError(null);
    try {
      const result = await client
        .mutation(ADD_CHANNEL_MEMBER_MUTATION, {
          input: { channelId, userId: targetUserId },
        })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setAddingUserId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="View members"
          />
        }
      >
        <Users size={15} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-10">
            <DialogTitle>Members</DialogTitle>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setInviteOpen((value) => !value)}
            >
              <UserPlus size={14} />
              Invite
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {channelMembers.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
            {channelMembers.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No members</p>
            )}
          </div>

          {inviteOpen && (
            <div className="border-t border-border pt-4">
              {error && <p className="px-2 pb-2 text-xs text-destructive">{error}</p>}
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {availableMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7"
                        disabled={addingUserId !== null}
                        onClick={() => void handleAdd(member.id)}
                      >
                        {addingUserId === member.id ? "Inviting..." : "Invite"}
                      </Button>
                    }
                  />
                ))}
                {availableMembers.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No available members
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
