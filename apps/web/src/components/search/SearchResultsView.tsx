import { useMemo, type ReactNode } from "react";
import { GitBranch, Hash, MessageCircle, Search } from "lucide-react";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import type { SessionGroupEntity } from "@trace/client-core";
import type { Channel, Chat } from "@trace/gql";
import { navigateToSession, useUIStore } from "../../stores/ui";
import { useSearchMessages, type SearchMessageResult } from "../../hooks/useSearchMessages";
import { SmallMessageAvatar } from "../chat/MessageAvatar";
import { ConnectionStatus } from "../ConnectionStatus";
import { cn } from "@/lib/utils";

/** Wraps case-insensitive occurrences of the query in a highlight mark. */
function highlightMatches(text: string, query: string): ReactNode {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const haystack = text.toLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor < text.length) {
    const idx = haystack.indexOf(needle, cursor);
    if (idx === -1) {
      nodes.push(text.slice(cursor));
      break;
    }
    if (idx > cursor) nodes.push(text.slice(cursor, idx));
    nodes.push(
      <mark key={key++} className="rounded bg-yellow-400/25 text-foreground">
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    cursor = idx + needle.length;
  }
  return nodes;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${date.toLocaleTimeString(
    [],
    { hour: "numeric", minute: "2-digit" },
  )}`;
}

interface Conversation {
  label: string;
  icon: ReactNode;
  /** Absent when the hit's conversation can't be navigated to (e.g. a group-less session). */
  onOpen?: () => void;
}

function SearchResultRow({
  result,
  query,
  conversation,
}: {
  result: SearchMessageResult;
  query: string;
  conversation: Conversation | null;
}) {
  // The server labels agent hits by coding tool (or "AI"); never show "Unknown".
  const authorName =
    result.actor.name ?? (result.actor.type === "agent" ? "AI" : "Unknown");
  const onOpen = conversation?.onOpen;
  const Wrapper = onOpen ? "button" : "div";
  return (
    <Wrapper
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
      className={cn(
        "flex w-full gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors",
        onOpen && "cursor-pointer hover:border-border hover:bg-surface-raised",
      )}
    >
      <SmallMessageAvatar actorName={authorName} avatarUrl={result.actor.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{authorName}</span>
          {conversation && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              {conversation.icon}
              <span className="truncate">{conversation.label}</span>
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatTimestamp(result.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground/90">
          {highlightMatches(result.text, query)}
        </p>
      </div>
    </Wrapper>
  );
}

export function SearchResultsView() {
  const query = useUIStore((s) => s.activeSearchQuery);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id ?? null);

  const channelsTable = useEntityStore((s: { channels: Record<string, Channel> }) => s.channels);
  const chatsTable = useEntityStore((s: { chats: Record<string, Chat> }) => s.chats);
  const sessionGroupsTable = useEntityStore(
    (s: { sessionGroups: Record<string, SessionGroupEntity> }) => s.sessionGroups,
  );

  const { results, loading, error } = useSearchMessages(query);

  const resolveConversation = useMemo(() => {
    return (result: SearchMessageResult): Conversation | null => {
      if (result.sessionId) {
        const groupId = result.sessionGroupId;
        const group = groupId ? sessionGroupsTable[groupId] : undefined;
        const sessionId = result.sessionId;
        return {
          label: group?.name ?? group?.slug ?? "Session",
          icon: <GitBranch size={12} />,
          // Navigation needs a session group; group-less sessions render as a
          // labeled, non-clickable row rather than a dead button.
          onOpen: groupId ? () => navigateToSession(null, groupId, sessionId) : undefined,
        };
      }
      if (result.channelId) {
        const channel = channelsTable[result.channelId];
        return {
          label: channel?.name ?? "Channel",
          icon: <Hash size={12} />,
          onOpen: () => setActiveChannelId(result.channelId as string),
        };
      }
      if (result.chatId) {
        const chat = chatsTable[result.chatId];
        const otherName = chat?.members?.find((m) => m.user.id !== currentUserId)?.user.name;
        return {
          label: chat?.name ?? (chat?.type === "dm" ? (otherName ?? "Direct Message") : "Group Chat"),
          icon: <MessageCircle size={12} />,
          onOpen: () => setActiveChatId(result.chatId as string),
        };
      }
      return null;
    };
  }, [
    channelsTable,
    chatsTable,
    sessionGroupsTable,
    currentUserId,
    setActiveChannelId,
    setActiveChatId,
  ]);

  const hasQuery = query.trim().length >= 2;

  return (
    <div className="flex h-full flex-col">
      <header className="app-region-drag flex h-12 shrink-0 items-center gap-2 border-b border-border py-0 pl-[var(--trace-header-title-offset)] pr-4 transition-[padding-left] duration-200 ease-in-out">
        <Search size={18} className="text-muted-foreground" />
        <h2 className="truncate text-lg font-semibold text-foreground">
          Results for: <span className="text-foreground">{query}</span>
        </h2>
        <ConnectionStatus />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!hasQuery ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Search size={40} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Type at least 2 characters to search.</p>
          </div>
        ) : error && results.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Search size={40} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Something went wrong searching. Try again.
            </p>
          </div>
        ) : loading && results.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Searching…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Search size={40} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No messages found for “{query.trim()}”.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-1 p-3">
            <p className="px-3 pb-1 text-xs text-muted-foreground">
              {results.length} {results.length === 1 ? "result" : "results"}
            </p>
            {results.map((result) => (
              <SearchResultRow
                key={result.id}
                result={result}
                query={query}
                conversation={resolveConversation(result)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
