import { useRef, useState, useCallback } from "react";
import { Send } from "lucide-react";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { toast } from "sonner";
import {
  optimisticallyInsertChannelMessage,
  reconcileOptimisticChannelMessage,
  removeOptimisticChannelMessage,
  useAuthStore,
  type AuthState,
} from "@trace/client-core";
import { useOrgMembers } from "../../hooks/useOrgMembers";
import { Button } from "../ui/button";
import { ChatEditor, type ChatEditorHandle } from "../chat/ChatEditor";
import {
  beginActionLatency,
  connectClientMutationLatency,
  expectActionEventLatency,
  markOptimisticLatency,
  measureMutationLatency,
} from "../../lib/action-latency";

const SEND_CHANNEL_MESSAGE = gql`
  mutation SendChannelMessage(
    $channelId: ID!
    $html: String
    $parentId: ID
    $clientMutationId: String
  ) {
    sendChannelMessage(
      channelId: $channelId
      html: $html
      parentId: $parentId
      clientMutationId: $clientMutationId
    ) {
      id
    }
  }
`;

export function ChannelComposer({ channelId, parentId }: { channelId: string; parentId?: string }) {
  const [sending, setSending] = useState(false);
  const editorRef = useRef<ChatEditorHandle>(null);
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  const mentionableUsers = useOrgMembers();

  const handleSubmit = useCallback(
    async (html: string, _text: string) => {
      if (sending) return;

      const interactionId = beginActionLatency("send-channel-message", { channelId });
      const {
        messageId: tempMessageId,
        eventId: tempEventId,
        clientMutationId,
      } = optimisticallyInsertChannelMessage(channelId, html, parentId);
      connectClientMutationLatency(clientMutationId, interactionId);
      setSending(true);
      markOptimisticLatency(interactionId);
      expectActionEventLatency({
        interactionId,
        action: "send-channel-message",
        scopeType: "channel",
        scopeId: channelId,
        eventType: "message_sent",
      });
      try {
        const result = await measureMutationLatency(
          interactionId,
          client
            .mutation(SEND_CHANNEL_MESSAGE, {
              channelId,
              html,
              parentId: parentId ?? null,
              clientMutationId,
            })
            .toPromise(),
        );

        if (result.error) {
          throw result.error;
        }
        const realMessageId = result.data?.sendChannelMessage?.id;
        if (realMessageId) {
          reconcileOptimisticChannelMessage(channelId, tempMessageId, tempEventId, realMessageId);
        }
      } catch (error) {
        removeOptimisticChannelMessage(channelId, tempMessageId, tempEventId);
        console.error("Failed to send channel message", error);
        toast.error(error instanceof Error ? error.message : "Failed to send message");
        throw error;
      } finally {
        setSending(false);
      }
    },
    [channelId, parentId, sending],
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
