import { useRef, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { Paperclip, Send, Square } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  ChatEditor,
  type ChatEditorHandle,
  type ChatEditorPasteFilesOptions,
  type ChatEditorSubmitOptions,
  type SlashCommandItem,
} from "../chat/ChatEditor";
import { ImageAttachmentBar, type FileAttachment } from "./ImageAttachmentBar";
import { MODE_CONFIG, type InteractionMode } from "./interactionModes";

interface SessionComposerProps {
  editorRef: RefObject<ChatEditorHandle | null>;
  mode: InteractionMode;
  initialHtml?: string;
  placeholder: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  attachmentDisabled?: boolean;
  attachments?: FileAttachment[];
  slashCommands?: SlashCommandItem[];
  controls: ReactNode;
  contextControls?: ReactNode;
  afterAttachment?: ReactNode;
  emptyHint?: ReactNode;
  isActive?: boolean;
  onSubmit: (html: string, text: string, options?: ChatEditorSubmitOptions) => void | Promise<void>;
  onChange?: (text: string, html: string) => void;
  onShiftTab?: () => void;
  onPasteFiles?: (files: File[], options?: ChatEditorPasteFilesOptions) => boolean;
  onAttachClick?: () => void;
  onFilesSelected?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onOpenAttachment?: (attachment: FileAttachment) => void;
  onStop?: () => void;
  onSend?: () => void;
  className?: string;
  sendLabel?: string;
}

const EMPTY_ATTACHMENTS: FileAttachment[] = [];

export function SessionComposer({
  editorRef,
  mode,
  initialHtml,
  placeholder,
  disabled,
  submitDisabled,
  attachmentDisabled,
  attachments = EMPTY_ATTACHMENTS,
  slashCommands,
  controls,
  contextControls,
  afterAttachment,
  emptyHint,
  isActive,
  onSubmit,
  onChange,
  onShiftTab,
  onPasteFiles,
  onAttachClick,
  onFilesSelected,
  onRemoveAttachment,
  onOpenAttachment,
  onStop,
  onSend,
  className,
  sendLabel,
}: SessionComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFilesSelected?.(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-surface-mid px-2 pt-2 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-border",
        MODE_CONFIG[mode].inputBorder,
        className,
      )}
    >
      {emptyHint}
      <ImageAttachmentBar
        attachments={attachments}
        onRemove={onRemoveAttachment ?? (() => undefined)}
        onOpenAttachment={onOpenAttachment}
      />
      <div className="session-editor">
        <ChatEditor
          ref={editorRef}
          initialHtml={initialHtml}
          onSubmit={onSubmit}
          placeholder={placeholder}
          disabled={disabled}
          submitDisabled={submitDisabled}
          slashCommands={slashCommands}
          onShiftTab={onShiftTab}
          onPasteFiles={onPasteFiles}
          hasAttachments={attachments.length > 0}
          onChange={onChange}
        />
      </div>
      {contextControls ? (
        <div className="session-composer-context flex min-h-[52px] items-center gap-2 border-t border-border px-3 py-2">
          {contextControls}
        </div>
      ) : null}
      <div className="@container flex items-center gap-1 pb-2 pl-1 pr-2 pt-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
        <button
          type="button"
          onClick={onAttachClick ?? (() => fileInputRef.current?.click())}
          disabled={disabled || attachmentDisabled || (!onAttachClick && !onFilesSelected)}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title="Attach files"
        >
          <Paperclip size={16} />
        </button>
        {afterAttachment}
        {controls}
        <div className="flex-1" />
        {isActive ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            title="Stop"
          >
            <Square size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend ?? (() => void editorRef.current?.submit())}
            disabled={submitDisabled || disabled}
            className={cn(
              "flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40",
              sendLabel ? "gap-1.5 px-3 text-[13px] font-medium" : "w-8",
            )}
            title="Send"
          >
            {sendLabel}
            <Send size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
