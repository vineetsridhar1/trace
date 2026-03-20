import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.bubble.css";
import Quill from "quill";
import { Mention } from "quill-mention";
import "./MentionBlot";
import "./mention-styles.css";
import { useOrgMembers } from "../../hooks/useOrgMembers";
import { useAuthStore } from "../../stores/auth";

Quill.register("modules/mention", Mention);

interface ChatEditorProps {
  onSubmit: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
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

export function ChatEditor({ onSubmit, placeholder = "Type a message...", disabled }: ChatEditorProps) {
  const quillRef = useRef<ReactQuill>(null);
  const [value, setValue] = useState("");
  const members = useOrgMembers();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const membersRef = useRef(members);
  const currentUserIdRef = useRef(currentUserId);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const modules = useMemo(
    () => ({
      toolbar: false,
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
          renderList: (values: Array<{ id: string; value: string; avatarUrl?: string | null; type: string }>, searchTerm: string) => void,
        ) => {
          const matches = membersRef.current
            .filter((m) => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((m) => ({
              id: m.id,
              value: m.name,
              avatarUrl: m.avatarUrl,
              type: "user",
            }));
          renderList(matches, searchTerm);
        },
        renderItem: (item: { id: string; value: string; avatarUrl?: string | null; type: string }) => {
          return createCustomUserElement(
            item.value,
            item.avatarUrl,
            item.id === currentUserIdRef.current,
          );
        },
      },
    }),
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const editor = quillRef.current?.getEditor();
        if (!editor || disabled) return;

        const html = editor.root.innerHTML;
        const text = editor.getText().trim();
        if (!text) return;

        onSubmit(html);
        setValue("");
      }
    },
    [onSubmit, disabled],
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
}
