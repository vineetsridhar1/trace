import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
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

export function AddChannelMemberDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [channelMemberIds, setChannelMemberIds] = useState<Set<string>>(() => new Set());
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
      setMembers(rawMembers.map((member) => member.user));
    }

    const rawChannelMembers = channelResult.data?.channel?.members as
      | Array<{ user: { id: string } }>
      | undefined;
    setChannelMemberIds(new Set(rawChannelMembers?.map((member) => member.user.id) ?? []));
  }, [activeOrgId, channelId]);

  useEffect(() => {
    if (open) void fetchMembers();
  }, [open, fetchMembers]);

  const availableMembers = useMemo(
    () => members.filter((member) => member.id !== userId && !channelMemberIds.has(member.id)),
    [channelMemberIds, members, userId],
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
      setError(err instanceof Error ? err.message : "Failed to add member");
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
            title="Add member"
          />
        }
      >
        <UserPlus size={15} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="max-h-60 space-y-1 overflow-y-auto py-4">
          {error && <p className="px-2 pb-2 text-xs text-destructive">{error}</p>}
          {availableMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => void handleAdd(member.id)}
              disabled={addingUserId !== null}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-elevated/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {member.avatarUrl ? (
                <img src={member.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                  {member.name[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <span className="truncate">{member.name}</span>
              {addingUserId === member.id && (
                <span className="ml-auto text-xs text-muted-foreground">Adding...</span>
              )}
            </button>
          ))}
          {availableMembers.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No available members</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
