import { useCallback, useRef, useState } from "react";
import type { Actor } from "@trace/gql";
import { useMessageField } from "@trace/client-core";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useUIStore, type UIState } from "../../stores/ui";
import { client } from "../../lib/urql";
import {
  DELETE_CHAT_MESSAGE_MUTATION,
  EDIT_CHAT_MESSAGE_MUTATION,
  DELETE_CHANNEL_MESSAGE_MUTATION,
  EDIT_CHANNEL_MESSAGE_MUTATION,
} from "../../lib/mutations";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import { MessageActionsSheet } from "./MessageActionsSheet";
import { MessageActionBar } from "./MessageActionBar";
import { MessageAvatar } from "./MessageAvatar";
import { MessageBody } from "./MessageBody";
import { useIsMobile } from "../../hooks/use-mobile";
import { useLongPressEvent } from "../../hooks/useLongPressEvent";
import { textToEditorHtml } from "./message-utils";

const EMPTY_REPLIERS: Actor[] = [];

export function ChatMessage({
  messageId,
  isGrouped = false,
}: {
  messageId: string;
  isGrouped?: boolean;
}) {
  const text = useMessageField(messageId, "text");
  const html = useMessageField(messageId, "html");
  const actor = useMessageField(messageId, "actor");
  const timestamp = useMessageField(messageId, "createdAt");
  const replyCount = useMessageField(messageId, "replyCount");
  const latestReplyAt = useMessageField(messageId, "latestReplyAt");
  const threadRepliers = useMessageField(messageId, "threadRepliers");
  const deletedAt = useMessageField(messageId, "deletedAt");
  const editedAt = useMessageField(messageId, "editedAt");
  const channelId = useMessageField(messageId, "channelId");
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  const setActiveThreadId = useUIStore((s: UIState) => s.setActiveThreadId);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const repliers = threadRepliers ?? EMPTY_REPLIERS;
  const canManageMessage = actor?.id === currentUserId && !deletedAt;

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const startEditing = useCallback(() => setEditing(true), []);
  const stopEditing = useCallback(() => setEditing(false), []);
  const openThread = useCallback(
    () => setActiveThreadId(messageId),
    [setActiveThreadId, messageId],
  );
  const deleteMutation = channelId ? DELETE_CHANNEL_MESSAGE_MUTATION : DELETE_CHAT_MESSAGE_MUTATION;
  const editMutation = channelId ? EDIT_CHANNEL_MESSAGE_MUTATION : EDIT_CHAT_MESSAGE_MUTATION;
  const handleDelete = useCallback(async () => {
    if (!window.confirm("Delete this message?")) return;
    await client.mutation(deleteMutation, { messageId }).toPromise();
  }, [messageId, deleteMutation]);
  const handleSaveEdit = useCallback(
    async (nextHtml: string) => {
      await client.mutation(editMutation, { messageId, html: nextHtml }).toPromise();
      setEditing(false);
    },
    [messageId, editMutation],
  );

  useLongPressEvent({ ref: messageRef, onLongPress: openSheet, disabled: !isMobile });

  if (!timestamp) return null;

  const messageText = text ?? "";
  const actorName = actor?.name ?? "Unknown";
  const avatarUrl = actor?.avatarUrl;
  const date = new Date(timestamp);
  const headerTime = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const gutterTime = date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "");
  const editorHtml = html && html.trim() ? html : textToEditorHtml(messageText);

  const bodyProps = {
    html, text: messageText, editing, editedAt, deletedAt, editorHtml,
    replyCount, latestReplyAt, repliers,
    onSaveEdit: handleSaveEdit, onCancelEdit: stopEditing, onOpenThread: openThread,
  };

  return (
    <>
      <div
        ref={messageRef}
        className={`group relative flex gap-3 px-4 hover:bg-surface-elevated/30 ${isGrouped ? "py-0.5" : "mt-2 pt-1 pb-0.5"} ${isMobile ? "select-none active:bg-surface-elevated/20" : ""}`}
      >
        <MessageActionBar
          canManage={canManageMessage}
          onThread={openThread}
          onEdit={startEditing}
          onDelete={() => void handleDelete()}
        />
        {isGrouped ? (
          <>
            <div className="mt-px w-9 shrink-0 pt-0.5 text-center opacity-0 group-hover:opacity-100">
              <span className="text-[10px] text-muted-foreground">{gutterTime}</span>
            </div>
            <div className="min-w-0 flex-1">
              <MessageBody {...bodyProps} />
            </div>
          </>
        ) : (
          <>
            <MessageAvatar actorId={actor?.id} actorName={actorName} avatarUrl={avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                {actor?.id ? (
                  <UserProfileChatCard userId={actor.id} fallbackName={actorName} fallbackAvatarUrl={avatarUrl}>
                    <span className="cursor-pointer text-[15px] font-bold text-foreground leading-snug hover:underline">
                      {actorName}
                    </span>
                  </UserProfileChatCard>
                ) : (
                  <span className="text-[15px] font-bold text-foreground leading-snug">{actorName}</span>
                )}
                <span className="text-xs text-muted-foreground">{headerTime}</span>
              </div>
              <MessageBody {...bodyProps} />
            </div>
          </>
        )}
      </div>

      {isMobile && !editing && (
        <MessageActionsSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onReplyInThread={openThread}
          onEdit={canManageMessage ? startEditing : undefined}
          onDelete={canManageMessage ? () => void handleDelete() : undefined}
        />
      )}
    </>
  );
}
