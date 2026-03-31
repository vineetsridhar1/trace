import { useRef, useState, useCallback } from "react";
import { Send } from "lucide-react";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { useAuthStore } from "../../stores/auth";
import { useOrgMembers } from "../../hooks/useOrgMembers";
import { Button } from "../ui/button";
import { ChatEditor, type ChatEditorHandle } from "./ChatEditor";
import {
  optimisticallyInsertChatMessage,
  reconcileOptimisticChatMessage,
  removeOptimisticChatMessage,
} from "../../lib/optimistic-message";

const SEND_CHAT_MESSAGE = gql`
  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID) {
    sendChatMessage(chatId: $chatId, html: $html, parentId: $parentId) {
      id
    }
  }
`;

export function ChatComposer({ chatId, parentId }: { chatId: string; parentId?: string }) {
  const [sending, setSending] = useState(false);
  const editorRef = useRef<ChatEditorHandle>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const mentionableUsers = useOrgMembers();

  const handleSubmit = useCallback(
    async (html: string) => {
      if (sending) return;

      setSending(true);

      // Insert optimistic message so it appears instantly
      const { messageId: tempMessageId, eventId: tempEventId } = optimisticallyInsertChatMessage(
        chatId,
        html,
        parentId,
      );

      try {
        const result = await client
          .mutation(SEND_CHAT_MESSAGE, {
            chatId,
            html,
            parentId: parentId ?? null,
          })
          .toPromise();

        if (result.error) {
          throw result.error;
        }

        const realMessageId = result.data?.sendChatMessage?.id;
        if (!realMessageId) {
          throw new Error("Failed to send message");
        }

        reconcileOptimisticChatMessage(chatId, tempMessageId, tempEventId, realMessageId);
      } catch (error) {
        removeOptimisticChatMessage(chatId, tempMessageId, tempEventId);
        console.error("Failed to send chat message", error);
        toast.error(error instanceof Error ? error.message : "Failed to send message");
        throw error;
      } finally {
        setSending(false);
      }
    },
    [chatId, parentId, sending],
  );

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <div className="flex-1 rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
        <ChatEditor
          ref={editorRef}
          onSubmit={handleSubmit}
          placeholder={parentId ? "Reply..." : "Type a message..."}
          disabled={sending}
          mentionableUsers={mentionableUsers}
          currentUserId={currentUserId}
        />
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={sending}
        aria-label="Send message"
        onClick={() => void editorRef.current?.submit()}
      >
        <Send size={16} />
      </Button>
    </div>
  );
}
