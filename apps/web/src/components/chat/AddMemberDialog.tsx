import { useState, useEffect, useCallback } from "react";
import { UserPlus } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { ORG_MEMBERS_QUERY } from "@trace/client-core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";

const ADD_CHAT_MEMBER_MUTATION = gql`
  mutation AddChatMember($input: AddChatMemberInput!) {
    addChatMember(input: $input) {
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

export function AddMemberDialog({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [adding, setAdding] = useState(false);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id);
  const chatMembers = useEntityField("chats", chatId, "members") as
    | Array<{ user: { id: string } }>
    | undefined;

  const fetchMembers = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(ORG_MEMBERS_QUERY, { id: activeOrgId }).toPromise();
    if (result.data?.organization?.members) {
      const rawMembers = result.data.organization.members as Array<{ user: OrgMember }>;
      setMembers(rawMembers.map((m) => m.user));
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (open) fetchMembers();
  }, [open, fetchMembers]);

  const existingMemberIds = new Set(
    chatMembers?.map((member: { user: { id: string } }) => member.user.id) ?? [],
  );
  const availableMembers = members.filter(
    (member: OrgMember) => member.id !== userId && !existingMemberIds.has(member.id),
  );

  async function handleAdd(targetUserId: string) {
    setAdding(true);
    try {
      await client
        .mutation(ADD_CHAT_MEMBER_MUTATION, {
          input: { chatId, userId: targetUserId },
        })
        .toPromise();
      setOpen(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        title="Add member"
      >
        <UserPlus size={16} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="max-h-60 space-y-1 overflow-y-auto py-4">
          {availableMembers.map((member: OrgMember) => (
            <button
              key={member.id}
              type="button"
              onClick={() => handleAdd(member.id)}
              disabled={adding}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-elevated/50 hover:text-foreground"
            >
              {member.avatarUrl ? (
                <img src={member.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                  {member.name[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <span>{member.name}</span>
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
