import type { Actor } from "@trace/gql";
import { MessageContent } from "./MessageContent";
import { InlineMessageEditor } from "./InlineMessageEditor";
import { ThreadRepliesButton } from "./ThreadRepliesButton";

export function MessageBody({
  html,
  text,
  editing,
  editedAt,
  deletedAt,
  editorHtml,
  replyCount,
  latestReplyAt,
  repliers,
  onSaveEdit,
  onCancelEdit,
  onOpenThread,
}: {
  html: string | null | undefined;
  text: string;
  editing: boolean;
  editedAt: string | null | undefined;
  deletedAt: string | null | undefined;
  editorHtml: string;
  replyCount?: number;
  latestReplyAt?: string | null;
  repliers?: Actor[];
  onSaveEdit: (html: string) => Promise<void>;
  onCancelEdit: () => void;
  onOpenThread?: () => void;
}) {
  return (
    <>
      {editing ? (
        <InlineMessageEditor
          initialHtml={editorHtml}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : deletedAt ? (
        <p className="m-0 italic text-[15px] leading-snug text-muted-foreground">
          This message has been deleted.
        </p>
      ) : html ? (
        <MessageContent html={html} />
      ) : (
        <p className="m-0 whitespace-pre-wrap text-[15px] leading-snug text-foreground">
          {text}
        </p>
      )}
      {!editing && editedAt && !deletedAt && (
        <span className="text-[11px] text-muted-foreground">(edited)</span>
      )}
      {!editing && onOpenThread && (replyCount ?? 0) > 0 && latestReplyAt && (
        <ThreadRepliesButton
          replyCount={replyCount ?? 0}
          latestTimestamp={latestReplyAt}
          repliers={repliers ?? []}
          onClick={onOpenThread}
        />
      )}
    </>
  );
}
