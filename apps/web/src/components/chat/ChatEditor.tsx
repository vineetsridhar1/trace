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

// Guard against double-registration (e.g. HMR in dev mode)
if (!Quill.imports["modules/mention"]) {
  Quill.register("modules/mention", Mention);
}

export interface MentionableUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ChatEditorHandle {
  focus: () => void;
  submit: () => Promise<boolean>;
}

interface ChatEditorProps {
  onSubmit: (html: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  initialHtml?: string;
  mentionableUsers?: MentionableUser[];
  currentUserId?: string | null;
}

function createCustomUserElement(
  text: string,
  avatarUrl?: string | null,
  isCurrentUser?: boolean,
): HTMLElement {
  const div = document.createElement("div");
  div.className = "user-item-container flex gap-2 items-center";

  if (avatarUrl) {
    const img = document.createElement("img");
    img.className = "user-item-avatar w-5 h-5 rounded-full object-cover";
    img.src = avatarUrl;
    img.alt = "";
    div.append(img);
  } else {
    const initialsDiv = document.createElement("div");
    initialsDiv.className =
      "user-item-avatar-initials size-5 flex items-center justify-center rounded-full text-[10px] bg-blue-900 text-blue-200";
    initialsDiv.textContent = text
      .split(" ")
      .map((n) => n[0])
      .join("");
    div.append(initialsDiv);
  }

  const name = document.createElement("span");
  name.className = "user-item-name";
  name.textContent = isCurrentUser ? `${text} (you)` : text;
  div.append(name);

  return div;
}

export const ChatEditor = forwardRef<ChatEditorHandle, ChatEditorProps>(function ChatEditor(
  {
    onSubmit,
    placeholder = "Type a message...",
    disabled,
    initialHtml = "",
    mentionableUsers = [],
    currentUserId,
  },
  ref,
) {
  const quillRef = useRef<ReactQuill>(null);
  const [value, setValue] = useState(initialHtml);
  const membersRef = useRef(mentionableUsers);
  const currentUserIdRef = useRef(currentUserId);

  useEffect(() => {
    setValue(initialHtml);
  }, [initialHtml]);

  useEffect(() => {
    membersRef.current = mentionableUsers;
  }, [mentionableUsers]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

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
        },
      },
      mention: {
        allowedChars: /^[A-Za-z\s0-9-]*$/,
        mentionDenotationChars: ["@"],
        blotName: "mention",
        defaultMenuOrientation: "top",
        showDenotationChar: false,
        dataAttributes: ["id", "value", "denotationChar", "link", "target", "disabled", "type"],
        isolateCharacter: true,
        source: (
          searchTerm: string,
          renderList: (
            values: Array<{ id: string; value: string; avatarUrl?: string | null; type: string }>,
            searchTerm: string,
          ) => void,
        ) => {
          const matches = membersRef.current
            .filter((member) => member.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((member) => ({
              id: member.id,
              value: member.name,
              avatarUrl: member.avatarUrl,
              type: "user",
            }));
          renderList(matches, searchTerm);
        },
        renderItem: (item: {
          id: string;
          value: string;
          avatarUrl?: string | null;
          type: string;
        }) =>
          createCustomUserElement(item.value, item.avatarUrl, item.id === currentUserIdRef.current),
      },
    }),
    [],
  );

  const submit = useCallback(async () => {
    const editor = quillRef.current?.getEditor();
    if (!editor || disabled) return false;

    const html = editor.root.innerHTML;
    const text = editor.getText().trim();
    if (!text) return false;

    try {
      await Promise.resolve(onSubmit(html));
      setValue("");
      return true;
    } catch {
      return false;
    }
  }, [disabled, onSubmit]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        quillRef.current?.focus();
      },
      submit,
    }),
    [submit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.stopPropagation();
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  return (
    <div className="chat-editor" onKeyDown={handleKeyDown}>
      <ReactQuill
        ref={quillRef}
        theme="bubble"
        value={value}
        onChange={setValue}
        modules={modules}
        placeholder={placeholder}
        readOnly={disabled}
      />
    </div>
  );
});
