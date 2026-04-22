import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowUpRight, Clipboard, Loader2 } from "lucide-react";
import { gql } from "@urql/core";
import { toast } from "sonner";
import type { Event } from "@trace/gql";
import {
  extractMessagePreview,
  stripPromptWrapping,
  useAuthStore,
} from "@trace/client-core";
import { asJsonObject } from "@trace/shared";
import { client } from "../../lib/urql";
import { HIDDEN_SESSION_PAYLOAD_TYPES } from "../../lib/session-event-filters";
import { cn, timeAgo } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { Sheet, SheetContent } from "../ui/sheet";
import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionLastActivityAt, getSessionRepo } from "./session-cell-data";

const SESSION_PEEK_EVENTS_QUERY = gql`
  query SessionPeekEvents(
    $organizationId: ID!
    $scope: ScopeInput
    $limit: Int
    $before: DateTime
    $excludePayloadTypes: [String!]
  ) {
    events(
      organizationId: $organizationId
      scope: $scope
      limit: $limit
      before: $before
      excludePayloadTypes: $excludePayloadTypes
    ) {
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

type PreviewMessage = {
  text: string;
  actorName: string | null;
  timestamp: string;
};

type PreviewState = {
  loading: boolean;
  message: PreviewMessage | null;
  error: string | null;
};

function workspacePath(channelId: string, row: SessionGroupRow): string {
  const sessionId = row.latestSession?.id ?? null;
  return sessionId
    ? `/c/${channelId}/g/${row.id}/s/${sessionId}`
    : `/c/${channelId}/g/${row.id}`;
}

function normalizePreviewText(text: string): string {
  return stripPromptWrapping(text).replace(/\s+/g, " ").trim();
}

function previewFromEvent(event: Event): PreviewMessage | null {
  const payload = asJsonObject(event.payload);
  if (!payload) return null;

  const rawText =
    event.eventType === "session_started" && typeof payload.prompt === "string"
      ? payload.prompt
      : extractMessagePreview(event.eventType, payload);
  const text = typeof rawText === "string" ? normalizePreviewText(rawText) : "";
  if (!text) return null;

  return {
    text,
    actorName: event.actor?.name ?? null,
    timestamp: event.timestamp,
  };
}

function cachedPreview(row: SessionGroupRow): PreviewMessage | null {
  const text = row.latestMessageSession?._lastEventPreview ?? row.latestSession?._lastEventPreview;
  if (!text) return null;

  const normalized = normalizePreviewText(text);
  if (!normalized) return null;

  return {
    text: normalized,
    actorName: null,
    timestamp: getSessionLastActivityAt(row) ?? row.updatedAt ?? row.createdAt,
  };
}

export function SessionPeekSheet({
  channelId,
  onArchive,
  onOpenChange,
  open,
  row,
}: {
  channelId: string;
  onArchive: (row: SessionGroupRow) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  row: SessionGroupRow | null;
}) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [preview, setPreview] = useState<PreviewState>({
    loading: false,
    message: null,
    error: null,
  });

  const targetSessionId = row?.latestMessageSession?.id ?? row?.latestSession?.id ?? null;
  const repo = row ? getSessionRepo(row) : null;
  const subtitle = useMemo(() => {
    if (!row) return null;
    if (repo && row.slug) return `${repo.name} / ${row.slug}`;
    return repo?.name ?? row.slug ?? null;
  }, [repo, row]);

  useEffect(() => {
    if (!open || !row) {
      setPreview({ loading: false, message: null, error: null });
      return;
    }

    const fallback = cachedPreview(row);
    setPreview({
      loading: Boolean(targetSessionId && activeOrgId),
      message: fallback,
      error: null,
    });

    if (!targetSessionId || !activeOrgId) {
      setPreview({ loading: false, message: fallback, error: null });
      return;
    }

    let cancelled = false;

    async function fetchPreview() {
      const result = await client
        .query(SESSION_PEEK_EVENTS_QUERY, {
          organizationId: activeOrgId,
          scope: { type: "session", id: targetSessionId },
          limit: 30,
          before: new Date().toISOString(),
          excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
        })
        .toPromise();

      if (cancelled) return;

      if (result.error) {
        setPreview({ loading: false, message: fallback, error: "Could not load preview" });
        return;
      }

      const events = ((result.data as { events?: Array<Event & { id: string }> } | undefined)
        ?.events ?? []);
      const message = [...events]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .map(previewFromEvent)
        .find((item): item is PreviewMessage => item !== null) ?? fallback;

      setPreview({ loading: false, message, error: null });
    }

    void fetchPreview();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, open, row, targetSessionId]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const openWorkspace = useCallback(() => {
    if (!row) return;
    navigateToSessionGroup(channelId, row.id, row.latestSession?.id ?? null);
    close();
  }, [channelId, close, row]);

  const copyWorkspaceLink = useCallback(async () => {
    if (!row) return;

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${workspacePath(channelId, row)}`);
      toast.success("Workspace link copied");
      close();
    } catch {
      toast.error("Could not copy link");
    }
  }, [channelId, close, row]);

  const archiveWorkspace = useCallback(() => {
    if (!row) return;
    close();
    onArchive(row);
  }, [close, onArchive, row]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-3 rounded-t-xl border-border bg-background px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3"
      >
        <div className="flex justify-center pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-4 shadow-lg shadow-black/20">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-foreground">
                {row?.name ?? "Workspace"}
              </h3>
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {preview.message && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(preview.message.timestamp)}
              </span>
            )}
          </div>

          <div
            className={cn(
              "mt-3 max-h-48 min-h-24 overflow-y-auto rounded-lg border border-border/60 bg-background/80 p-3 text-sm leading-relaxed text-foreground",
              !preview.message && "flex items-center justify-center text-muted-foreground",
            )}
          >
            {preview.loading && !preview.message ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" />
                Loading latest message
              </span>
            ) : preview.message ? (
              <div>
                {preview.message.actorName && (
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    {preview.message.actorName}
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{preview.message.text}</p>
              </div>
            ) : (
              <span>{preview.error ?? "No messages yet"}</span>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
          <button
            type="button"
            className="flex h-12 w-full items-center gap-3 px-4 text-left text-sm text-foreground active:bg-muted"
            onClick={openWorkspace}
          >
            <ArrowUpRight size={18} className="text-muted-foreground" />
            Open Workspace
          </button>
          <button
            type="button"
            className="flex h-12 w-full items-center gap-3 border-t border-border px-4 text-left text-sm text-foreground active:bg-muted"
            onClick={() => void copyWorkspaceLink()}
          >
            <Clipboard size={18} className="text-muted-foreground" />
            Copy Workspace Link
          </button>
          <button
            type="button"
            className="flex h-12 w-full items-center gap-3 border-t border-border px-4 text-left text-sm text-destructive active:bg-muted"
            onClick={archiveWorkspace}
          >
            <Archive size={18} className="text-destructive" />
            Archive Workspace
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
