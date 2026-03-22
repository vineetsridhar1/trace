import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Send } from "lucide-react";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import {
  useEntityStore,
  useEntityField,
  useScopedEventIds,
  useScopedEventField,
  eventScopeKey,
} from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";
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

function MessageItem({ scopeKey, eventId }: { scopeKey: string; eventId: string }) {
  const payload = useScopedEventField(scopeKey, eventId, "payload");
  const actor = useScopedEventField(scopeKey, eventId, "actor");
  const timestamp = useScopedEventField(scopeKey, eventId, "timestamp");

  const parsed = asJsonObject(payload);
  const text = typeof parsed?.text === "string" ? parsed.text : "";
  const actorObj = actor as { name?: string; avatarUrl?: string } | undefined;
  const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="group flex gap-3 px-4 py-1.5 hover:bg-muted/30">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
        {actorObj?.avatarUrl ? (
          <img src={actorObj.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          (actorObj?.name?.[0] ?? "?")
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{actorObj?.name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}

export function TextChannelView({ channelId }: { channelId: string }) {
  const channelName = useEntityField("channels", channelId, "name");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertManyScopedEvents = useEntityStore((s) => s.upsertManyScopedEvents);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scopeKey = eventScopeKey("channel", channelId);
  const eventIds = useScopedEventIds(scopeKey, (a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Filter to only message_sent events
  const messageEventIds = useEntityStore(
    useCallback(
      (state) => {
        const bucket = state.eventsByScope[scopeKey];
        if (!bucket) return [];
        return Object.entries(bucket)
          .filter(([, e]) => e.eventType === "message_sent")
          .sort(([, a], [, b]) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .map(([id]) => id);
      },
      [scopeKey],
    ),
  );

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageEventIds.length]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;

    setSending(true);
    setMessage("");
    await client.mutation(SEND_MESSAGE_MUTATION, { channelId, text }).toPromise();
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3.5 w-[30%]" />
                  <Skeleton className="h-3.5 w-[60%]" />
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
            {messageEventIds.map((id) => (
              <MessageItem key={id} scopeKey={scopeKey} eventId={id} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${channelName ?? "channel"}`}
            rows={1}
            className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="shrink-0"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
