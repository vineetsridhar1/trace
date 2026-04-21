import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { useAuthStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { ORG_MEMBERS_QUERY } from "@trace/client-core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";
import { Button } from "../ui/button";

const CREATE_CHAT_MUTATION = gql`
  mutation CreateChat($input: CreateChatInput!) {
    createChat(input: $input) {
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

export function CreateChatDialog() {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const userId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);
  const setActiveChatId = useUIStore((s: { setActiveChatId: (id: string | null) => void }) => s.setActiveChatId);

  const fetchMembers = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(ORG_MEMBERS_QUERY, { id: activeOrgId }).toPromise();
    if (result.data?.organization?.members) {
      const rawMembers = result.data.organization.members as Array<{ user: OrgMember }>;
      setMembers(rawMembers.map((m) => m.user));
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (open) {
      fetchMembers();
      setSelectedIds(new Set());
    }
  }, [open, fetchMembers]);

  function toggleMember(id: string) {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0 || !activeOrgId) return;

    setCreating(true);
    try {
      const result = await client
        .mutation(CREATE_CHAT_MUTATION, {
          input: {
            memberIds: [...selectedIds],
          },
        })
        .toPromise();

      // Read only the new ID for navigation — entity store is updated by the event stream
      const chatId = result.data?.createChat?.id as string | undefined;
      setOpen(false);
      if (chatId) {
        setActiveChatId(chatId);
      }
    } finally {
      setCreating(false);
    }
  }

  // Filter out current user
  const otherMembers = members.filter((m: OrgMember) => m.id !== userId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        title="New message"
      >
        <Plus size={16} />
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="mb-1.5 block text-sm text-muted-foreground">
              Select members ({selectedIds.size === 1 ? "DM" : selectedIds.size > 1 ? "Group" : "none selected"})
            </label>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {otherMembers.map((member: OrgMember) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleMember(member.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    selectedIds.has(member.id)
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-surface-elevated/50 hover:text-foreground"
                  }`}
                >
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                      {member.name[0]}
                    </div>
                  )}
                  <span>{member.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{member.email}</span>
                </button>
              ))}
              {otherMembers.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No other members</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={selectedIds.size === 0 || creating}>
              {creating ? "Creating..." : "Start Chat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
