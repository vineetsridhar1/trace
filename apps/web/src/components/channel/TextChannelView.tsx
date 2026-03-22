import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import {
  useEntityStore,
  useEntityField,
  useScopedEventField,
  eventScopeKey,
} from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { useOrgMembers } from "../../hooks/useOrgMembers";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";
import { MessageAvatar } from "../chat/MessageAvatar";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import { ChatEditor, type ChatEditorHandle } from "../chat/ChatEditor";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

const CHANNEL_EVENTS_QUERY = gql`
  query ChannelEvents($organizationId: ID!, $scope: ScopeInput!, $types: [String!], $limit: Int) {
    events(organizationId: $organizationId, scope: $scope, types: $types, limit: $limit) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
        name
        avatarUrl
      }
      parentId
      timestamp
      metadata
    }
  }
`;

const SEND_MESSAGE_MUTATION = gql`
  mutation SendChannelMessage($channelId: ID!, $text: String!) {
    sendMessage(channelId: $channelId, text: $text) {
      id
    }
  }
`;

/** Max gap in ms between messages from the same user to be grouped (5 min like Slack) */
const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

function ChannelMessageItem({
  scopeKey,
  eventId,
  isGrouped,
}: {
  scopeKey: string;
  eventId: string;
  isGrouped: boolean;
}) {
  const payload = useScopedEventField(scopeKey, eventId, "payload");
  const actor = useScopedEventField(scopeKey, eventId, "actor");
  const timestamp = useScopedEventField(scopeKey, eventId, "timestamp");

  const parsed = asJsonObject(payload);
  const text = typeof parsed?.text === "string" ? parsed.text : "";
  const actorObj = actor as { id?: string; name?: string; avatarUrl?: string } | undefined;
  const actorName = actorObj?.name ?? "Unknown";
  const avatarUrl = actorObj?.avatarUrl;

  if (!timestamp) return null;

  const date = new Date(timestamp);
  const headerTime = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const gutterTime = date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "");

  return (
    <div
      className={`group relative flex gap-3 px-4 hover:bg-surface-elevated/30 ${isGrouped ? "py-0.5" : "mt-2 pt-1 pb-0.5"}`}
    >
      {isGrouped ? (
        <>
          <div className="mt-px w-9 shrink-0 pt-0.5 text-center opacity-0 group-hover:opacity-100">
            <span className="text-[10px] text-muted-foreground">{gutterTime}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap break-words">{text}</p>
          </div>
        </>
      ) : (
        <>
          <MessageAvatar actorId={actorObj?.id} actorName={actorName} avatarUrl={avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {actorObj?.id ? (
                <UserProfileChatCard userId={actorObj.id} fallbackName={actorName} fallbackAvatarUrl={avatarUrl}>
                  <span className="cursor-pointer text-[15px] font-bold text-foreground leading-snug hover:underline">
                    {actorName}
                  </span>
                </UserProfileChatCard>
              ) : (
                <span className="text-[15px] font-bold text-foreground leading-snug">{actorName}</span>
              )}
              <span className="text-xs text-muted-foreground">{headerTime}</span>
            </div>
            <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap break-words">{text}</p>
          </div>
        </>
      )}
    </div>
  );
}

function useMessageEventIds(scopeKey: string): string[] {
  const selector = useMemo(
    () => (state: { eventsByScope: Record<string, Record<string, Event>> }) => {
      const bucket = state.eventsByScope[scopeKey];
      if (!bucket) return [] as string[];
      return Object.entries(bucket)
        .filter(([, e]) => e.eventType === "message_sent")
        .sort(([, a], [, b]) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(([id]) => id);
    },
    [scopeKey],
  );
  return useEntityStore(useShallow(selector));
}

/** Compute grouping flags identical to ChatMessageList */
function useGroupedFlags(scopeKey: string, eventIds: string[]): boolean[] {
  const events = useEntityStore(
    useShallow((state) => {
      const bucket = state.eventsByScope[scopeKey];
      if (!bucket) return [] as (Event | null)[];
      return eventIds.map((id) => bucket[id] ?? null);
    }),
  );

  return useMemo(() => {
    const flags: boolean[] = new Array(events.length).fill(false);
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      if (!prev || !curr) continue;
      const prevActorId = (prev.actor as { id?: string })?.id ?? null;
      const currActorId = (curr.actor as { id?: string })?.id ?? null;
      const sameActor = prevActorId != null && prevActorId === currActorId;
      const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
      flags[i] = sameActor && timeDiff < GROUP_THRESHOLD_MS;
    }
    return flags;
  }, [events]);
}

export function TextChannelView({ channelId }: { channelId: string }) {
  const channelName = useEntityField("channels", channelId, "name");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const upsertManyScopedEvents = useEntityStore((s) => s.upsertManyScopedEvents);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const editorRef = useRef<ChatEditorHandle>(null);
  const mentionableUsers = useOrgMembers();

  const scopeKey = eventScopeKey("channel", channelId);
  const messageEventIds = useMessageEventIds(scopeKey);
  const groupedFlags = useGroupedFlags(scopeKey, messageEventIds);

  const fetchMessages = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(CHANNEL_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "channel", id: channelId },
        types: ["message_sent"],
        limit: 50,
      })
      .toPromise();

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      upsertManyScopedEvents(scopeKey, events);
    }
    setLoading(false);
  }, [activeOrgId, channelId, scopeKey, upsertManyScopedEvents]);

  useEffect(() => {
    setLoading(true);
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView();
    }
    wasAtBottomRef.current = true;
  }, [channelId, loading]);

  // Auto-scroll to bottom smoothly when new messages arrive
  useEffect(() => {
    if (wasAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageEventIds.length]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const handleSubmit = useCallback(
    async (html: string) => {
      if (sending) return;
      // Strip HTML tags for plain text channel messages
      const div = document.createElement("div");
      div.innerHTML = html;
      const text = div.textContent?.trim() ?? "";
      if (!text) return;

      setSending(true);
      try {
        const result = await client.mutation(SEND_MESSAGE_MUTATION, { channelId, text }).toPromise();
        if (result.error) throw result.error;
      } catch (error) {
        console.error("Failed to send channel message", error);
        toast.error(error instanceof Error ? error.message : "Failed to send message");
        throw error;
      } finally {
        setSending(false);
      }
    },
    [channelId, sending],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <MessageSquare size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {channelName ?? "Channel"}
        </h2>
        <ConnectionStatus />
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {loading ? (
          <div className="flex-1 overflow-hidden px-4 py-2 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-[70%]" />
                </div>
              </div>
            ))}
          </div>
        ) : messageEventIds.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare size={32} className="opacity-30" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="py-2">
            {messageEventIds.map((id, idx) => (
              <ChannelMessageItem
                key={id}
                scopeKey={scopeKey}
                eventId={id}
                isGrouped={groupedFlags[idx]}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — same as DM ChatComposer */}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <div className="flex-1 rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
          <ChatEditor
            ref={editorRef}
            onSubmit={handleSubmit}
            placeholder={`Message #${channelName ?? "channel"}`}
            disabled={sending}
            mentionableUsers={mentionableUsers}
            currentUserId={currentUserId}
          />
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={sending}
          aria-label="Send message"
          onClick={() => void editorRef.current?.submit()}
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
