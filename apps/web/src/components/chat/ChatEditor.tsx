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
  submit: () => Promise<boolean>;
  getText: () => string;
  clear: () => void;
}

interface ChatEditorProps {
  onSubmit: (html: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  initialHtml?: string;
  mentionableUsers?: MentionableUser[];
  currentUserId?: string | null;
  slashCommands?: SlashCommandItem[];
  onSlashCommandSelect?: (cmd: SlashCommandItem) => void;
  onShiftTab?: () => void;
  onChange?: (text: string) => void;
}

export const ChatEditor = forwardRef<ChatEditorHandle, ChatEditorProps>(function ChatEditor(
  {
    onSubmit,
    placeholder = "Type a message...",
    disabled,
    initialHtml = "",
    mentionableUsers = [],
    currentUserId,
    slashCommands,
    onSlashCommandSelect,
    onShiftTab,
    onChange,
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

  membersRef.current = mentionableUsers;
  currentUserIdRef.current = currentUserId;
  slashCommandsRef.current = slashCommands;
  onSlashCommandSelectRef.current = onSlashCommandSelect;
  onShiftTabRef.current = onShiftTab;
  onChangeRef.current = onChange;

  useEffect(() => {
    setValue(initialHtml);
  }, [initialHtml]);

  const enableSlashCommands = slashCommands !== undefined;

  const clearEditor = useCallback(() => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      editor.setText("");
    }
    setValue("");
    onChangeRef.current?.("");
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

    setValue(editor.root.innerHTML);
    onChangeRef.current?.(editor.getText().replace(/\n$/, ""));
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
        dataAttributes: ["id", "value", "denotationChar", "link", "target", "disabled", "type", "description", "source", "category"],
        isolateCharacter: true,
        source: (
          searchTerm: string,
          renderList: (
            values: Array<Record<string, unknown>>,
            searchTerm: string,
          ) => void,
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
              .filter((member: MentionableUser) => member.name.toLowerCase().includes(searchTerm.toLowerCase()))
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

  const submit = useCallback(async () => {
    const editor = quillRef.current?.getEditor();
    if (!editor || disabled) return false;

    const html = editor.root.innerHTML;
    const text = editor.getText().trim();
    if (!text) return false;

    try {
      await Promise.resolve(onSubmit(html));
      clearEditor();
      return true;
    } catch {
      return false;
    }
  }, [clearEditor, disabled, onSubmit]);

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
      clear: () => {
        clearEditor();
      },
    }),
    [clearEditor, submit],
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
        void submit();
      }
    },
    [isMentionMenuOpen, submit],
  );

  const handleChange = useCallback(
    (content: string) => {
      setValue(content);
      if (onChangeRef.current) {
        const editor = quillRef.current?.getEditor();
        const text = editor?.getText().replace(/\n$/, "") ?? "";
        onChangeRef.current(text);
      }
    },
    [],
  );

  return (
    <div className="chat-editor" onKeyDown={handleKeyDown}>
      <ReactQuill
        ref={quillRef}
        theme="bubble"
        value={value}
        onChange={handleChange}
        modules={modules}
        placeholder={placeholder}
        readOnly={disabled}
      />
    </div>
  );
});
