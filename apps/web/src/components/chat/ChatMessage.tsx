import { useCallback, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { MessageContent } from "./MessageContent";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import { MessageActionsSheet } from "./MessageActionsSheet";
import { useIsMobile } from "../../hooks/use-mobile";
import { useLongPressEvent } from "../../hooks/useLongPressEvent";

interface Actor {
  id?: string;
  name?: string;
  avatarUrl?: string;
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ThreadRepliesButton({
  replyCount,
  latestTimestamp,
  replierAvatars,
  onClick,
}: {
  replyCount: number;
  latestTimestamp: string;
  replierAvatars: Array<{ name?: string; avatarUrl?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="-ml-3 flex w-full cursor-pointer items-center gap-2 rounded-md pl-3 pr-3 py-1.5 hover:bg-surface-elevated/50"
    >
      <div className="flex -space-x-1.5">
        {replierAvatars.map((replier, i) =>
          replier.avatarUrl ? (
            <img
              key={i}
              src={replier.avatarUrl}
              alt={replier.name ?? ""}
              className="h-6 w-6 rounded-md border-2 border-background"
            />
          ) : (
            <div
              key={i}
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
  eventId,
  isGrouped = false,
}: {
  eventId: string;
  isGrouped?: boolean;
}) {
  const text = useEntityField("events", eventId, "payload") as Record<string, unknown> | undefined;
  const actor = useEntityField("events", eventId, "actor") as Actor | undefined;
  const timestamp = useEntityField("events", eventId, "timestamp") as string | undefined;
  const threadSummary = useEntityStore((state) => state.threadSummaries[eventId]);
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);
  const replyCount = threadSummary?.replyCount ?? 0;
  const latestTimestamp = threadSummary?.latestReplyAt ?? "";
  const replierAvatars = (threadSummary?.repliers ?? []).map((replier) => ({
    name: replier.name,
    avatarUrl: replier.avatarUrl,
  }));
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  useLongPressEvent({ ref: messageRef, onLongPress: openSheet, disabled: !isMobile });

  if (!timestamp) return null;

  const messageText = typeof text?.text === "string" ? text.text : "";
  const actorName = actor?.name ?? "Unknown";
  const avatarUrl = actor?.avatarUrl;
  const date = new Date(timestamp);
  /** 12-hour with AM/PM for the name row */
  const headerTime = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  /** 12-hour without AM/PM for the compact gutter */
  const gutterTime = date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "");

  return (
    <>
      <div
        ref={messageRef}
        className={`group relative flex gap-3 px-4 hover:bg-surface-elevated/30 ${isGrouped ? "py-0.5" : "mt-2 pt-1 pb-0.5"} ${isMobile ? "select-none active:bg-surface-elevated/20" : ""}`}
      >
        {/* Desktop hover toolbar — hidden on mobile */}
        <div className="absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-surface-elevated shadow-sm md:group-hover:inline-flex">
          <button
            onClick={() => setActiveThreadId(eventId)}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Reply in thread"
          >
            <MessageSquare size={15} />
          </button>
        </div>

        {isGrouped ? (
          /* Grouped: show hover timestamp in the gutter where the avatar normally goes */
          <>
            <div className="mt-px w-9 shrink-0 pt-0.5 text-center opacity-0 group-hover:opacity-100">
              <span className="text-[10px] text-muted-foreground">{gutterTime}</span>
            </div>
            <div className="min-w-0 flex-1">
              {typeof text?.html === "string" ? (
                <MessageContent html={text.html} />
              ) : (
                <p className="m-0 whitespace-pre-wrap text-[15px] leading-snug text-foreground">
                  {messageText}
                </p>
              )}
              {replyCount > 0 && (
                <ThreadRepliesButton
                  replyCount={replyCount}
                  latestTimestamp={latestTimestamp}
                  replierAvatars={replierAvatars}
                  onClick={() => setActiveThreadId(eventId)}
                />
              )}
            </div>
          </>
        ) : (
          /* Full message: avatar + name + timestamp */
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
              </div>
              {typeof text?.html === "string" ? (
                <MessageContent html={text.html} />
              ) : (
                <p className="m-0 whitespace-pre-wrap text-[15px] leading-snug text-foreground">
                  {messageText}
                </p>
              )}
              {replyCount > 0 && (
                <ThreadRepliesButton
                  replyCount={replyCount}
                  latestTimestamp={latestTimestamp}
                  replierAvatars={replierAvatars}
                  onClick={() => setActiveThreadId(eventId)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Mobile long-press action sheet */}
      {isMobile && (
        <MessageActionsSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onReplyInThread={() => setActiveThreadId(eventId)}
        />
      )}
    </>
  );
}
