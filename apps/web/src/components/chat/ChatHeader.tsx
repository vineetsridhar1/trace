import { useState, useRef, useEffect } from "react";
import { Hash, Pencil } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import type { Chat } from "@trace/gql";
import { SidebarTrigger } from "../ui/sidebar";
import { AddMemberDialog } from "./AddMemberDialog";

const RENAME_CHAT_MUTATION = gql`
  mutation RenameChat($chatId: ID!, $name: String!) {
    renameChat(chatId: $chatId, name: $name) {
      id
      name
    }
  }
`;

export function ChatHeader({ chatId }: { chatId: string }) {
  const name = useEntityField("chats", chatId, "name");
  const type = useEntityField("chats", chatId, "type");
  const members = useEntityField("chats", chatId, "members") as
    | Array<{ user: { id: string; name: string; avatarUrl?: string } }>
    | undefined;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const otherMember = members?.find((member) => member.user.id !== currentUserId);
  const displayName = name ?? (type === "dm" ? (otherMember?.user.name ?? "Direct Message") : "Group Chat");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleStartEdit = () => {
    if (type !== "group") return;
    setDraft(typeof displayName === "string" ? displayName : "");
    setEditing(true);
  };

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === displayName) return;
    // Optimistic update — write to store before server round-trip
    useEntityStore.getState().patch("chats", chatId, { name: trimmed } as Partial<Chat>);
    await client.mutation(RENAME_CHAT_MUTATION, { chatId, name: trimmed }).toPromise();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger />
      {type === "dm" ? (
        <>
          {otherMember?.user.avatarUrl ? (
            <img
              src={otherMember.user.avatarUrl}
              alt={otherMember.user.name}
              className="h-7 w-7 rounded-md"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
              {(otherMember?.user.name ?? "?")[0]?.toUpperCase()}
            </div>
          )}
          <h2 className="text-sm font-bold text-foreground">{displayName}</h2>
        </>
      ) : (
        <>
          <Hash size={18} className="text-muted-foreground" strokeWidth={2.5} />
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              className="h-7 rounded border border-border bg-surface-elevated px-2 text-lg font-bold text-foreground outline-none focus:border-ring"
            />
          ) : (
            <button
              onClick={handleStartEdit}
              className="group/title flex items-center gap-1.5"
            >
              <h2 className="text-lg font-bold text-foreground">{displayName}</h2>
              <Pencil size={14} className="text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{members?.length ?? 0} members</span>
            <AddMemberDialog chatId={chatId} />
          </div>
        </>
      )}
    </div>
  );
}
