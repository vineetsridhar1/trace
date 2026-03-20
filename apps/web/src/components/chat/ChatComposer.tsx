import { useState, useRef } from "react";
import { Send } from "lucide-react";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";

const SEND_CHAT_MESSAGE = gql`
  mutation SendChatMessage($chatId: ID!, $text: String!, $parentId: ID) {
    sendChatMessage(chatId: $chatId, text: $text, parentId: $parentId) {
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
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      await client
        .mutation(SEND_CHAT_MESSAGE, {
          chatId,
          text: text.trim(),
          parentId: parentId ?? null,
        })
        .toPromise();
      setText("");
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={parentId ? "Reply..." : "Type a message..."}
        rows={1}
        className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button type="submit" size="icon" variant="ghost" disabled={!text.trim() || sending}>
        <Send size={16} />
      </Button>
    </form>
  );
}
