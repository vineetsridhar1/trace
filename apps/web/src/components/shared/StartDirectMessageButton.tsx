import { useCallback, useState } from "react";
import { MessageSquare } from "lucide-react";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { useAuthStore } from "../../stores/auth";
import { useUIStore } from "../../stores/ui";
import { Button } from "../ui/button";

const CREATE_CHAT_MUTATION = gql`
  mutation CreateDM($input: CreateChatInput!) {
    createChat(input: $input) {
      id
    }
  }
`;

export function StartDirectMessageButton({ userId }: { userId: string }) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const isMe = userId === currentUserId;
  const [creating, setCreating] = useState(false);

  const handleClick = useCallback(async () => {
    if (!activeOrgId || !currentUserId || isMe || creating) return;

    setCreating(true);
    try {
      const result = await client
        .mutation(CREATE_CHAT_MUTATION, {
          input: {
            organizationId: activeOrgId,
            memberIds: [userId],
          },
        })
        .toPromise();

      if (result.error) {
        throw result.error;
      }

      const chatId = result.data?.createChat?.id as string | undefined;
      if (chatId) {
        // Navigate immediately — the chat_created event via useOrgEvents
        // will populate the entity store for all clients.
        setActiveChatId(chatId);
      }
    } catch (error) {
      console.error("Failed to start direct message", error);
      toast.error(error instanceof Error ? error.message : "Failed to start chat");
    } finally {
      setCreating(false);
    }
  }, [activeOrgId, creating, currentUserId, isMe, setActiveChatId, userId]);

  if (isMe) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full gap-2"
      disabled={creating}
      onClick={() => void handleClick()}
    >
      <MessageSquare size={14} />
      {creating ? "Opening..." : "Chat"}
    </Button>
  );
}
