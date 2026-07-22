import { useRef, useCallback, useState } from "react";
import { Send } from "lucide-react";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useOrgMembers } from "../../hooks/useOrgMembers";
import { Button } from "../ui/button";
import { ChatEditor, type ChatEditorHandle } from "./ChatEditor";
import {
  optimisticallyInsertChatMessage,
  reconcileOptimisticChatMessage,
  removeOptimisticChatMessage,
} from "@trace/client-core";
import { markJustSent } from "./just-sent";
import { useChatDraftStore } from "../../stores/chat-drafts";

const SEND_CHAT_MESSAGE = gql`
  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID, $clientMutationId: String!) {
    sendChatMessage(
      chatId: $chatId
      html: $html
      parentId: $parentId
      clientMutationId: $clientMutationId
    ) {
      id
    }
  }
`;

export function ChatComposer({ chatId, parentId }: { chatId: string; parentId?: string }) {
  const editorRef = useRef<ChatEditorHandle>(null);
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  const mentionableUsers = useOrgMembers();
  const draftKey = parentId ? `${chatId}:thread:${parentId}` : chatId;
  const [initialHtml] = useState(() => useChatDraftStore.getState().drafts[draftKey]?.html ?? "");

  const handleSubmit = useCallback(
    async (html: string, _text: string) => {
      // Insert optimistic message so it appears instantly
      const {
        messageId: tempMessageId,
        eventId: tempEventId,
        clientMutationId,
      } = optimisticallyInsertChatMessage(chatId, html, parentId);

      // Mark so the message animates in once when it renders.
      markJustSent(tempMessageId);

      try {
        const result = await client
          .mutation(SEND_CHAT_MESSAGE, {
            chatId,
            html,
            parentId: parentId ?? null,
            clientMutationId,
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
        // Re-throw so ChatEditor.submit() catches it and restores the editor content
        throw error;
      }
    },
    [chatId, parentId],
  );

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <div className="flex-1 rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
        <ChatEditor
          ref={editorRef}
          onSubmit={handleSubmit}
          placeholder={parentId ? "Reply..." : "Type a message..."}
          initialHtml={initialHtml}
          onChange={(text, html) => useChatDraftStore.getState().setDraft(draftKey, { text, html })}
          mentionableUsers={mentionableUsers}
          currentUserId={currentUserId}
        />
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Send message"
        onClick={() => void editorRef.current?.submit()}
      >
        <Send size={16} />
      </Button>
    </div>
  );
}
