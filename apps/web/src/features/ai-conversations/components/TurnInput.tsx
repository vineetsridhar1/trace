import { useState, useCallback, type RefObject } from "react";
import { Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useSendTurn } from "../hooks/useAiConversationMutations";

interface TurnInputProps {
  branchId: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export function TurnInput({ branchId, inputRef }: TurnInputProps) {
  const [value, setValue] = useState("");
  const sendTurn = useSendTurn();
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setValue("");
    try {
      await sendTurn({ branchId, content: trimmed });
    } finally {
      setSending(false);
      inputRef?.current?.focus();
    }
  }, [value, sending, sendTurn, branchId, inputRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={sending}
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/50 disabled:opacity-50"
        />
        <Button
          variant="default"
          size="icon"
          onClick={handleSend}
          disabled={!value.trim() || sending}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
