import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BrainCircuit } from "lucide-react";
import { useEntityStore, type AiConversationEntity } from "../../../stores/entity";
import { useAuthStore } from "../../../stores/auth";
import { ConversationListItem } from "./ConversationListItem";

type ListRow =
  | { type: "header"; label: string }
  | { type: "conversation"; id: string };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function buildRows(
  conversationIds: string[],
  conversations: Record<string, AiConversationEntity>,
  userId: string | undefined,
  searchQuery: string,
  visibilityFilter: "all" | "private" | "shared",
): ListRow[] {
  const now = Date.now();
  const query = searchQuery.toLowerCase().trim();

  const filtered = conversationIds.filter((id) => {
    const conv = conversations[id];
    if (!conv) return false;

    // Visibility filter
    if (visibilityFilter === "private" && conv.visibility !== "PRIVATE") return false;
    if (visibilityFilter === "shared" && conv.visibility !== "ORG") return false;

    // Search filter
    if (query) {
      const title = (conv.title ?? "").toLowerCase();
      return title.includes(query);
    }

    return true;
  });

  if (filtered.length === 0) return [];

  // When searching/filtering, show a flat list
  if (query || visibilityFilter !== "all") {
    return filtered.map((id) => ({ type: "conversation" as const, id }));
  }

  // Group: Recents (last 7 days), Mine (private), Shared (org)
  const recents: string[] = [];
  const mine: string[] = [];
  const shared: string[] = [];

  for (const id of filtered) {
    const conv = conversations[id];
    if (!conv) continue;
    const age = now - new Date(conv.updatedAt).getTime();

    if (age < SEVEN_DAYS_MS) {
      recents.push(id);
    } else if (conv.visibility === "PRIVATE" && conv.createdById === userId) {
      mine.push(id);
    } else {
      shared.push(id);
    }
  }

  const rows: ListRow[] = [];

  if (recents.length > 0) {
    rows.push({ type: "header", label: "Recents" });
    for (const id of recents) rows.push({ type: "conversation", id });
  }
  if (mine.length > 0) {
    rows.push({ type: "header", label: "Mine" });
    for (const id of mine) rows.push({ type: "conversation", id });
  }
  if (shared.length > 0) {
    rows.push({ type: "header", label: "Shared" });
    for (const id of shared) rows.push({ type: "conversation", id });
  }

  return rows;
}

interface ConversationListProps {
  conversationIds: string[];
  activeConversationId: string | null;
  onConversationClick: (id: string) => void;
  searchQuery: string;
  visibilityFilter: "all" | "private" | "shared";
}

export function ConversationList({
  conversationIds,
  activeConversationId,
  onConversationClick,
  searchQuery,
  visibilityFilter,
}: ConversationListProps) {
  const conversations = useEntityStore((s) => s.aiConversations);
  const userId = useAuthStore((s) => s.user?.id);

  const rows = useMemo(
    () => buildRows(conversationIds, conversations, userId, searchQuery, visibilityFilter),
    [conversationIds, conversations, userId, searchQuery, visibilityFilter],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index].type === "header" ? 32 : 52),
    overscan: 10,
  });

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
          <BrainCircuit size={24} className="text-muted-foreground" />
        </div>
        {searchQuery || visibilityFilter !== "all" ? (
          <p className="text-sm text-muted-foreground">
            No conversations match your filters.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">No conversations yet</p>
            <p className="text-sm text-muted-foreground">
              Start a new AI conversation to get going.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto px-2">
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.type === "header" ? (
                <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {row.label}
                </div>
              ) : (
                <ConversationListItem
                  id={row.id}
                  isActive={row.id === activeConversationId}
                  onClick={onConversationClick}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
