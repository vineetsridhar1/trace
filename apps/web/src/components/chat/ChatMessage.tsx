import { useCallback, useRef, useState } from "react";
import type { Actor } from "@trace/gql";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import {
  DELETE_CHAT_MESSAGE_MUTATION,
  EDIT_CHAT_MESSAGE_MUTATION,
} from "../../lib/mutations";
import { MessageContent } from "./MessageContent";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import { MessageActionsSheet } from "./MessageActionsSheet";
import { useIsMobile } from "../../hooks/use-mobile";
import { useLongPressEvent } from "../../hooks/useLongPressEvent";
import { InlineMessageEditor } from "./InlineMessageEditor";
import { formatRelativeTime, textToEditorHtml } from "./message-utils";

function ThreadRepliesButton({
  replyCount,
  latestTimestamp,
  repliers,
  onClick,
}: {
  replyCount: number;
  latestTimestamp: string;
  repliers: Actor[];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="-ml-3 flex w-full cursor-pointer items-center gap-2 rounded-md pl-3 pr-3 py-1.5 hover:bg-surface-elevated/50"
    >
      <div className="flex -space-x-1.5">
        {repliers.map((replier, i) =>
          replier.avatarUrl ? (
            <img
              key={`${replier.type}:${replier.id}:${i}`}
              src={replier.avatarUrl}
              alt={replier.name ?? ""}
              className="h-6 w-6 rounded-md border-2 border-background"
            />
          ) : (
            <div
              key={`${replier.type}:${replier.id}:${i}`}
              className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground"
            >
              {replier.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          ),
        )}
      </div>
      <span className="text-[13px] font-bold text-blue-400 hover:underline">
        {replyCount} {replyCount === 1 ? "reply" : "replies"}
      </span>
      <span className="text-xs text-muted-foreground">{formatRelativeTime(latestTimestamp)}</span>
    </button>
  );
}

export function ChatMessage({
  messageId,
  isGrouped = false,
}: {
  messageId: string;
  isGrouped?: boolean;
}) {
  const text = useEntityField("messages", messageId, "text") as string | undefined;
  const html = useEntityField("messages", messageId, "html") as string | null | undefined;
  const actor = useEntityField("messages", messageId, "actor") as Actor | undefined;
  const timestamp = useEntityField("messages", messageId, "createdAt") as string | undefined;
  const replyCount = useEntityField("messages", messageId, "replyCount") as number | undefined;
  const latestReplyAt = useEntityField("messages", messageId, "latestReplyAt") as
    | string
    | null
    | undefined;
  const threadRepliers = useEntityField("messages", messageId, "threadRepliers") as
    | Actor[]
    | undefined;
  const deletedAt = useEntityField("messages", messageId, "deletedAt") as string | null | undefined;
  const editedAt = useEntityField("messages", messageId, "editedAt") as string | null | undefined;
  const currentUserId = useAuthStore((s) => s.user?.id);
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const canManageMessage = actor?.id === currentUserId && !deletedAt;
  const openSheet = useCallback(() => setSheetOpen(true), []);
  useLongPressEvent({ ref: messageRef, onLongPress: openSheet, disabled: !isMobile });

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

  const messageText = text ?? "";
  const actorName = actor?.name ?? "Unknown";
  const avatarUrl = actor?.avatarUrl;
  const date = new Date(timestamp);
  const headerTime = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const gutterTime = date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "");
  const editorHtml = html && html.trim() ? html : textToEditorHtml(messageText);

  return (
    <>
      <div
        ref={messageRef}
        className={`group relative flex gap-3 px-4 hover:bg-surface-elevated/30 ${isGrouped ? "py-0.5" : "mt-2 pt-1 pb-0.5"} ${isMobile ? "select-none active:bg-surface-elevated/20" : ""}`}
      >
        <div className="absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-surface-elevated shadow-sm md:group-hover:inline-flex">
          <button
            onClick={() => setActiveThreadId(messageId)}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Reply in thread"
          >
            <MessageSquare size={15} />
          </button>
          {canManageMessage && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Edit message"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => void handleDelete()}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Delete message"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>

        {isGrouped ? (
          <>
            <div className="mt-px w-9 shrink-0 pt-0.5 text-center opacity-0 group-hover:opacity-100">
              <span className="text-[10px] text-muted-foreground">{gutterTime}</span>
            </div>
            <div className="min-w-0 flex-1">
              {editing ? (
                <InlineMessageEditor
                  initialHtml={editorHtml}
                  onSave={handleSaveEdit}
                  onCancel={() => setEditing(false)}
                />
              ) : deletedAt ? (
                <p className="m-0 italic text-[15px] leading-snug text-muted-foreground">
                  This message was deleted.
                </p>
              ) : html ? (
                <MessageContent html={html} />
              ) : (
                <p className="m-0 whitespace-pre-wrap text-[15px] leading-snug text-foreground">
                  {messageText}
                </p>
              )}
              {!editing && editedAt && !deletedAt && (
                <span className="text-[11px] text-muted-foreground">(edited)</span>
              )}
              {!editing && (replyCount ?? 0) > 0 && latestReplyAt && (
                <ThreadRepliesButton
                  replyCount={replyCount ?? 0}
                  latestTimestamp={latestReplyAt}
                  repliers={threadRepliers ?? []}
                  onClick={() => setActiveThreadId(messageId)}
                />
              )}
            </div>
          </>
        ) : (
          <>
            {actor?.id ? (
              <UserProfileChatCard
                userId={actor.id}
                fallbackName={actorName}
                fallbackAvatarUrl={avatarUrl}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={actorName}
                    className="mt-0.5 h-9 w-9 shrink-0 rounded-lg"
                  />
                ) : (
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                    {actorName[0]?.toUpperCase()}
                  </div>
                )}
              </UserProfileChatCard>
            ) : avatarUrl ? (
              <img src={avatarUrl} alt={actorName} className="mt-0.5 h-9 w-9 shrink-0 rounded-lg" />
            ) : (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                {actorName[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                {actor?.id ? (
                  <UserProfileChatCard
                    userId={actor.id}
                    fallbackName={actorName}
                    fallbackAvatarUrl={avatarUrl}
                  >
                    <span className="cursor-pointer text-[15px] font-bold text-foreground leading-snug hover:underline">
                      {actorName}
                    </span>
                  </UserProfileChatCard>
                ) : (
                  <span className="text-[15px] font-bold text-foreground leading-snug">
                    {actorName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{headerTime}</span>
                {editedAt && !deletedAt && (
                  <span className="text-[11px] text-muted-foreground">(edited)</span>
                )}
              </div>
              {editing ? (
                <InlineMessageEditor
                  initialHtml={editorHtml}
                  onSave={handleSaveEdit}
                  onCancel={() => setEditing(false)}
                />
              ) : deletedAt ? (
                <p className="italic text-[15px] leading-snug text-muted-foreground">
                  This message was deleted.
                </p>
              ) : html ? (
                <MessageContent html={html} />
              ) : (
                <p className="m-0 whitespace-pre-wrap text-[15px] leading-snug text-foreground">
                  {messageText}
                </p>
              )}
              {!editing && (replyCount ?? 0) > 0 && latestReplyAt && (
                <ThreadRepliesButton
                  replyCount={replyCount ?? 0}
                  latestTimestamp={latestReplyAt}
                  repliers={threadRepliers ?? []}
                  onClick={() => setActiveThreadId(messageId)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {isMobile && !editing && (
        <MessageActionsSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onReplyInThread={() => setActiveThreadId(messageId)}
          onEdit={canManageMessage ? () => setEditing(true) : undefined}
          onDelete={canManageMessage ? () => void handleDelete() : undefined}
        />
      )}
    </>
  );
}
