import {
  forwardRef,
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.bubble.css";
import Quill from "quill";
import { Mention } from "quill-mention";
import "./MentionBlot";
import "./mention-styles.css";
import { createCustomUserElement, createSlashCommandElement } from "./mention-dom";

// Guard against double-registration (e.g. HMR in dev mode)
if (!Quill.imports["modules/mention"]) {
  Quill.register("modules/mention", Mention);
}

const EDITOR_FORMATS = ["mention"];
// Keep large pastes out of the editor DOM by attaching them as text files instead.
const LARGE_PASTE_CHARACTER_THRESHOLD = 3_000;

function createPastedTextFile(text: string): File {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([text], `pasted-text-${timestamp}.txt`, {
    type: "text/plain",
    lastModified: Date.now(),
  });
}

export interface MentionableUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface SlashCommandItem {
  id: string;
  value: string;
  description: string;
  source: string;
  category: string;
  type: "slash_command";
}

export interface ChatEditorHandle {
  focus: () => void;
  submit: (options?: ChatEditorSubmitOptions) => Promise<boolean>;
  getText: () => string;
  setText: (text: string) => void;
  clear: () => void;
}

export interface ChatEditorSubmitOptions {
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export interface ChatEditorPasteFilesOptions {
  fallbackToEditor?: boolean;
}

interface ChatEditorProps {
  onSubmit: (html: string, text: string, options?: ChatEditorSubmitOptions) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  initialHtml?: string;
  mentionableUsers?: MentionableUser[];
  currentUserId?: string | null;
  slashCommands?: SlashCommandItem[];
  onSlashCommandSelect?: (cmd: SlashCommandItem) => void;
  onShiftTab?: () => void;
  onChange?: (text: string, html: string) => void;
  onPasteFiles?: (files: File[], options?: ChatEditorPasteFilesOptions) => boolean;
  hasAttachments?: boolean;
}

export const ChatEditor = forwardRef<ChatEditorHandle, ChatEditorProps>(function ChatEditor(
  {
    onSubmit,
    placeholder = "Type a message...",
    disabled,
    submitDisabled,
    initialHtml = "",
    mentionableUsers = [],
    currentUserId,
    slashCommands,
    onSlashCommandSelect,
    onShiftTab,
    onChange,
    onPasteFiles,
    hasAttachments = false,
  }: ChatEditorProps,
  ref: React.ForwardedRef<ChatEditorHandle>,
) {
  const quillRef = useRef<ReactQuill>(null);
  const [value, setValue] = useState(initialHtml);
  const membersRef = useRef(mentionableUsers);
  const currentUserIdRef = useRef(currentUserId);
  const slashCommandsRef = useRef(slashCommands);
  const onSlashCommandSelectRef = useRef(onSlashCommandSelect);
  const onShiftTabRef = useRef(onShiftTab);
  const onChangeRef = useRef(onChange);
  const onPasteFilesRef = useRef(onPasteFiles);
  const hasAttachmentsRef = useRef(hasAttachments);

  membersRef.current = mentionableUsers;
  currentUserIdRef.current = currentUserId;
  slashCommandsRef.current = slashCommands;
  onSlashCommandSelectRef.current = onSlashCommandSelect;
  onShiftTabRef.current = onShiftTab;
  onChangeRef.current = onChange;
  onPasteFilesRef.current = onPasteFiles;
  hasAttachmentsRef.current = hasAttachments;

  useEffect(() => {
    setValue(initialHtml);
  }, [initialHtml]);

  // Intercept paste at the DOM level BEFORE Quill's clipboard module runs.
  // Quill registers its handler on the editor root during initialization,
  // so we attach ours with { capture: true } to fire first.
  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    const root = editor?.root;
    if (!root) return;
    const handler = (e: ClipboardEvent) => {
      if (!onPasteFilesRef.current) return;

      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onPasteFilesRef.current(files);
        return;
      }

      const pastedText = e.clipboardData?.getData("text/plain") ?? "";
      if (pastedText.length > LARGE_PASTE_CHARACTER_THRESHOLD) {
        const handled = onPasteFilesRef.current([createPastedTextFile(pastedText)], {
          fallbackToEditor: true,
        });
        if (handled) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    };
    root.addEventListener("paste", handler, { capture: true });
    return () => root.removeEventListener("paste", handler, { capture: true });
  }, []);

  const enableSlashCommands = slashCommands !== undefined;

  const clearEditor = useCallback(() => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      editor.setText("");
    }
    setValue("");
    onChangeRef.current?.("", "");
  }, []);

  const replaceEditorText = useCallback((text: string) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    editor.setText(text, "user");
    editor.setSelection(editor.getLength(), 0, "silent");
    const nextHtml = editor.root.innerHTML;
    setValue(nextHtml);
    onChangeRef.current?.(editor.getText().replace(/\n$/, ""), nextHtml);
  }, []);

  const isMentionMenuOpen = useCallback(() => {
    const editor = quillRef.current?.getEditor();
    const mentionModule = editor?.getModule("mention") as { isOpen?: boolean } | undefined;
    return mentionModule?.isOpen === true;
  }, []);

  const insertSlashCommandText = useCallback((commandName: string) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    const selection = editor.getSelection(true);
    const cursorIndex = selection?.index ?? 0;
    const textBeforeCursor = editor.getText(0, cursorIndex);
    const match = textBeforeCursor.match(/\/[^\s]*$/);
    const replacement = `/${commandName} `;

    if (match) {
      const start = cursorIndex - match[0].length;
      editor.deleteText(start, match[0].length, "user");
      editor.insertText(start, replacement, "user");
      editor.setSelection(start + replacement.length, 0, "silent");
    } else {
      editor.insertText(cursorIndex, replacement, "user");
      editor.setSelection(cursorIndex + replacement.length, 0, "silent");
    }

    const nextHtml = editor.root.innerHTML;
    setValue(nextHtml);
    onChangeRef.current?.(editor.getText().replace(/\n$/, ""), nextHtml);
  }, []);

  const modules = useMemo(
    () => ({
      toolbar: false,
      keyboard: {
        bindings: {
          enter: {
            key: "Enter",
            handler: () => false,
          },
          shiftEnter: {
            key: "Enter",
            shiftKey: true,
            handler: () => true,
          },
          shiftTab: {
            key: "Tab",
            shiftKey: true,
            handler: () => {
              onShiftTabRef.current?.();
              return false;
            },
          },
        },
      },
      mention: {
        allowedChars: /^[A-Za-z\s0-9_-]*$/,
        mentionDenotationChars: enableSlashCommands ? ["@", "/"] : ["@"],
        blotName: "mention",
        defaultMenuOrientation: "top",
        showDenotationChar: false,
        dataAttributes: [
          "id",
          "value",
          "denotationChar",
          "link",
          "target",
          "disabled",
          "type",
          "description",
          "source",
          "category",
        ],
        isolateCharacter: true,
        source: (
          searchTerm: string,
          renderList: (values: Array<Record<string, unknown>>, searchTerm: string) => void,
          mentionChar: string,
        ) => {
          if (mentionChar === "/") {
            const commands = slashCommandsRef.current ?? [];
            const matches = commands.filter((cmd: SlashCommandItem) =>
              cmd.value.toLowerCase().startsWith(searchTerm.toLowerCase()),
            );
            renderList(matches as unknown as Array<Record<string, unknown>>, searchTerm);
          } else {
            const matches = membersRef.current
              .filter((member: MentionableUser) =>
                member.name.toLowerCase().includes(searchTerm.toLowerCase()),
              )
              .map((member: MentionableUser) => ({
                id: member.id,
                value: member.name,
                avatarUrl: member.avatarUrl,
                type: "user",
              }));
            renderList(matches, searchTerm);
          }
        },
        renderItem: (item: Record<string, unknown>) => {
          if (item.type === "slash_command") {
            return createSlashCommandElement(item.value as string, item.description as string);
          }
          return createCustomUserElement(
            item.value as string,
            item.avatarUrl as string | null | undefined,
            item.id === currentUserIdRef.current,
          );
        },
        onSelect: (
          item: Record<string, unknown>,
          insertItem: (item: Record<string, unknown>) => void,
        ) => {
          if (item.denotationChar === "/") {
            insertSlashCommandText(String(item.value ?? ""));
            onSlashCommandSelectRef.current?.(item as unknown as SlashCommandItem);
            return;
          }
          insertItem(item);
        },
      },
    }),
    [enableSlashCommands, insertSlashCommandText],
  );

  const submit = useCallback(
    async (options?: ChatEditorSubmitOptions) => {
      const editor = quillRef.current?.getEditor();
      if (!editor || disabled || submitDisabled) return false;

      const html = editor.root.innerHTML;
      const text = editor.getText().trim();
      if (!text && !hasAttachmentsRef.current) return false;

      // Clear input immediately so it feels instant — the optimistic message
      // is already in the store by the time onSubmit returns synchronously.
      clearEditor();

      try {
        await Promise.resolve(onSubmit(html, text, options));
        return true;
      } catch {
        // Restore editor content on failure so the user can retry.
        // Only use the Quill imperative path — handleChange will propagate to setValue.
        const ed = quillRef.current?.getEditor();
        if (ed) {
          ed.clipboard.dangerouslyPasteHTML(html);
        }
        return false;
      }
    },
    [clearEditor, disabled, onSubmit, submitDisabled],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        quillRef.current?.focus();
      },
      submit,
      getText: () => {
        const editor = quillRef.current?.getEditor();
        return editor?.getText().trim() ?? "";
      },
      setText: replaceEditorText,
      clear: () => {
        clearEditor();
      },
    }),
    [clearEditor, replaceEditorText, submit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.stopPropagation();
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (isMentionMenuOpen()) {
          return;
        }
        e.preventDefault();
        void submit({ metaKey: e.metaKey, ctrlKey: e.ctrlKey });
      }
    },
    [isMentionMenuOpen, submit],
  );

  const handleChange = useCallback((content: string) => {
    setValue(content);
    if (onChangeRef.current) {
      const editor = quillRef.current?.getEditor();
      const text = editor?.getText().replace(/\n$/, "") ?? "";
      onChangeRef.current(text, content);
    }
  }, []);

  return (
    <div className="chat-editor" onKeyDown={handleKeyDown}>
      <ReactQuill
        ref={quillRef}
        theme="bubble"
        value={value}
        onChange={handleChange}
        modules={modules}
        formats={EDITOR_FORMATS}
        placeholder={placeholder}
        readOnly={disabled}
      />
    </div>
  );
});
