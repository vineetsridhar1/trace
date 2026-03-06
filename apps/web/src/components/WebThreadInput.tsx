import { useCallback, useRef, useState } from "react";
import { FiSend } from "react-icons/fi";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";

interface WebThreadInputProps {
  workspaceId: string;
  channelId: string;
  disabled?: boolean;
}

export function WebThreadInput({
  workspaceId,
  channelId,
  disabled,
}: WebThreadInputProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useWorkspaceActions();

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || disabled || sending) return;

    setSending(true);
    const previousInput = input;
    setInput("");

    try {
      const result = await sendMessage(workspaceId, text, channelId);
      if (!result.success) {
        setInput(previousInput);
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, disabled, sending, sendMessage, workspaceId, channelId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t border-edge px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Instance offline..." : "Send to Claude..."}
          style={
            {
              fieldSizing: "content",
              minHeight: 38,
              maxHeight: 120,
            } as React.CSSProperties
          }
          className={`w-full resize-none rounded-md border bg-surface px-3 py-2 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-edge-hover ${
            disabled
              ? "cursor-not-allowed border-edge opacity-50"
              : "border-edge"
          }`}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={disabled || !input.trim() || sending}
          className="btn-primary h-[38px] cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiSend className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
