import { useState, useCallback } from "react";
import { Send } from "lucide-react";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { ChatEditor } from "./ChatEditor";

const SEND_CHAT_MESSAGE = gql`
  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID) {
    sendChatMessage(chatId: $chatId, html: $html, parentId: $parentId) {
      id
    }
  }
`;

export function ChatComposer({
  chatId,
  parentId,
}: {
  chatId: string;
  parentId?: string;
}) {
  const [sending, setSending] = useState(false);

  const handleSubmit = useCallback(
    async (html: string) => {
      if (sending) return;

      setSending(true);
      try {
        await client
          .mutation(SEND_CHAT_MESSAGE, {
            chatId,
            html,
            parentId: parentId ?? null,
          })
          .toPromise();
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
          onSubmit={handleSubmit}
          placeholder={parentId ? "Reply..." : "Type a message..."}
          disabled={sending}
        />
      </div>
      <Button type="button" size="icon" variant="ghost" disabled={sending}>
        <Send size={16} />
      </Button>
    </div>
  );
}
