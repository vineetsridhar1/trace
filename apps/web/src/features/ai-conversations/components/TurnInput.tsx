import { useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { useSendTurn } from "../hooks/useAiConversationMutations";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

interface TurnInputProps {
  branchId: string;
  disabled?: boolean;
}

export function TurnInput({ branchId, disabled }: TurnInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendTurn = useSendTurn();

  // Auto-focus on mount and branch change
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [branchId, disabled]);

  const handleSubmit = useCallback(async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const content = textarea.value.trim();
    if (!content || !branchId || disabled) return;

    textarea.value = "";
    resetHeight(textarea);

    await sendTurn({ branchId, content });
  }, [branchId, disabled, sendTurn]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resetHeight(textarea);
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="border-t border-border p-3">
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2",
          "focus-within:ring-1 focus-within:ring-ring",
          disabled && "opacity-50",
        )}
      >
        <textarea
          ref={textareaRef}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={disabled ? "Waiting for AI response..." : "Send a message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          style={{ maxHeight: 200 }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          onClick={() => void handleSubmit()}
          aria-label="Send message"
          className="h-7 w-7 shrink-0"
        >
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}

function resetHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
}
