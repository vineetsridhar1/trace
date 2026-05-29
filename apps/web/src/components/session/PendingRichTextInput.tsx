import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { ChatEditor, type ChatEditorHandle } from "../chat/ChatEditor";
import { textToEditorHtml } from "../chat/message-utils";

interface PendingRichTextInputProps {
  value: string;
  placeholder: string;
  disabled?: boolean;
  submitLabel: string;
  SubmitIcon: LucideIcon;
  submitDisabled?: boolean;
  allowEmptySubmit?: boolean;
  resetKey?: string | number;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void | Promise<void>;
}

export function PendingRichTextInput({
  value,
  placeholder,
  disabled,
  submitLabel,
  SubmitIcon,
  submitDisabled,
  allowEmptySubmit = false,
  resetKey = "default",
  onChange,
  onSubmit,
}: PendingRichTextInputProps) {
  const editorRef = useRef<ChatEditorHandle>(null);
  const valueRef = useRef(value);
  const [initialHtml, setInitialHtml] = useState(() => textToEditorHtml(value));
  valueRef.current = value;

  useEffect(() => {
    setInitialHtml(textToEditorHtml(valueRef.current));
  }, [resetKey]);

  const handleSubmit = useCallback(
    async (_html: string, text: string) => {
      await onSubmit(text);
    },
    [onSubmit],
  );

  return (
    <div className="flex min-w-0 flex-1 items-end gap-2">
      <div className="pending-rich-text-input session-editor min-w-0 flex-1 rounded-lg border border-border bg-surface-deep focus-within:ring-1 focus-within:ring-accent">
        <ChatEditor
          key={resetKey}
          ref={editorRef}
          initialHtml={initialHtml}
          onSubmit={handleSubmit}
          onChange={(text) => onChange(text)}
          placeholder={placeholder}
          disabled={disabled}
          submitDisabled={submitDisabled}
        />
      </div>
      <button
        type="button"
        disabled={submitDisabled || disabled}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          void (async () => {
            const submitted = await editorRef.current?.submit();
            if (!submitted && allowEmptySubmit && !submitDisabled && !disabled) {
              await onSubmit(value);
            }
          })();
        }}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        <SubmitIcon size={14} />
        {submitLabel}
      </button>
    </div>
  );
}
