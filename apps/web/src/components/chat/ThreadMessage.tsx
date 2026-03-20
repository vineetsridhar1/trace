import { useCallback, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useMessageField } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import {
  DELETE_CHAT_MESSAGE_MUTATION,
  EDIT_CHAT_MESSAGE_MUTATION,
} from "../../lib/mutations";
import { MessageContent } from "./MessageContent";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import { SmallMessageAvatar } from "./MessageAvatar";
import { useIsMobile } from "../../hooks/use-mobile";
import { useLongPressEvent } from "../../hooks/useLongPressEvent";
import { MessageActionsSheet } from "./MessageActionsSheet";
import { InlineMessageEditor } from "./InlineMessageEditor";
import { textToEditorHtml } from "./message-utils";

export function ThreadMessage({ messageId }: { messageId: string }) {
  const text = useMessageField(messageId, "text");
  const html = useMessageField(messageId, "html");
  const actor = useMessageField(messageId, "actor");
  const timestamp = useMessageField(messageId, "createdAt");
  const deletedAt = useMessageField(messageId, "deletedAt");
  const editedAt = useMessageField(messageId, "editedAt");
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const canManageMessage = actor?.id === currentUserId && !deletedAt;
  const openSheet = useCallback(() => setSheetOpen(true), []);
  const startEditing = useCallback(() => setEditing(true), []);
  const stopEditing = useCallback(() => setEditing(false), []);

  useLongPressEvent({
    ref: messageRef,
    onLongPress: openSheet,
    disabled: !isMobile || editing,
  });

  const handleDelete = useCallback(async () => {
    if (!window.confirm("Delete this message?")) return;
    await client.mutation(DELETE_CHAT_MESSAGE_MUTATION, { messageId }).toPromise();
  }, [messageId]);

  const handleSaveEdit = useCallback(
    async (nextHtml: string) => {
      await client.mutation(EDIT_CHAT_MESSAGE_MUTATION, { messageId, html: nextHtml }).toPromise();
      setEditing(false);
    },
    [messageId],
  );

  if (!timestamp) return null;

  const actorName = actor?.name ?? "Unknown";
  const avatarUrl = actor?.avatarUrl;
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const editorHtml = html && html.trim() ? html : textToEditorHtml(text ?? "");

  return (
    <>
      <div
        ref={messageRef}
        className={`group relative flex gap-3 px-3 py-1.5 ${isMobile ? "select-none active:bg-surface-elevated/20" : "hover:bg-surface-elevated/20"}`}
      >
        <div className="absolute right-3 top-2 hidden items-center rounded-md border border-border bg-surface-elevated shadow-sm md:group-hover:inline-flex">
          {canManageMessage && (
            <>
              <button
                onClick={startEditing}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Edit message"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => void handleDelete()}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Delete message"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>

        <SmallMessageAvatar actorId={actor?.id} actorName={actorName} avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {actor?.id ? (
              <UserProfileChatCard
                userId={actor.id}
                fallbackName={actorName}
                fallbackAvatarUrl={avatarUrl}
              >
                <span className="cursor-pointer text-sm font-bold text-foreground hover:underline">
                  {actorName}
                </span>
              </UserProfileChatCard>
            ) : (
              <span className="text-sm font-bold text-foreground">{actorName}</span>
            )}
            <span className="text-xs text-muted-foreground">{time}</span>
            {editedAt && !deletedAt && (
              <span className="text-[11px] text-muted-foreground">(edited)</span>
            )}
          </div>
          {editing ? (
            <InlineMessageEditor
              initialHtml={editorHtml}
              onSave={handleSaveEdit}
              onCancel={stopEditing}
            />
          ) : deletedAt ? (
            <p className="whitespace-pre-wrap text-sm italic leading-relaxed text-muted-foreground">
              This message has been deleted.
            </p>
          ) : html ? (
            <MessageContent html={html} />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
          )}
        </div>
      </div>

      {isMobile && !editing && (
        <MessageActionsSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onEdit={canManageMessage ? startEditing : undefined}
          onDelete={canManageMessage ? () => void handleDelete() : undefined}
        />
      )}
    </>
  );
}
