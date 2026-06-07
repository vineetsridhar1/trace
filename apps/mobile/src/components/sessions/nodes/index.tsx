import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  HIDDEN_SESSION_PAYLOAD_TYPES,
  buildSessionNodes,
  eventScopeKey,
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useScopedEventField,
  useScopedEvents,
} from "@trace/client-core";
import type { Event } from "@trace/gql";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { Text, Spinner } from "@/components/design-system";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";
import { SESSION_EVENTS_QUERY } from "@/hooks/session-events-gql";
import {
  asFetchedEvent,
  type CollapsedSessionEventsSummary,
} from "@/hooks/session-events-timeline";
import type { SessionStreamNode } from "../sessionStreamItems";
import { AskUserQuestionCard } from "./AskUserQuestionCard";
import { CommandExecutionRow } from "./CommandExecutionRow";
import { PlanReviewCard } from "./PlanReviewCard";
import { PRCard, type PRCardKind } from "./PRCard";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { SystemBadge } from "./SystemBadge";
import { UserMessageBubble } from "./UserMessageBubble";
import { renderSessionOutput } from "./event-output";
import type { NodeRenderContext } from "./render-context";

interface RenderNodeProps {
  node: SessionStreamNode;
  context: NodeRenderContext;
}

/**
 * Dispatches a `SessionNode` to its renderer. Row padding is owned by
 * `SessionStream.renderItem` so every list cell has a stable element tree —
 * FlashList v2 recycles cells by shape and will crash ("Attempt to recycle
 * a mounted view") if the root varies between null and a View.
 *
 * Event-kind nodes the dispatcher can't render are filtered upstream by
 * `useSessionNodes`, so this switch only needs to handle the known cases.
 */
export function renderNode(props: RenderNodeProps): ReactNode {
  const { node, context } = props;
  switch (node.kind) {
    case "collapsed-events":
      return <CollapsedEventsNode collapsed={node.collapsed} context={context} />;
    case "command-execution":
      return (
        <CommandExecutionRow command={node.command} output={node.output} exitCode={node.exitCode} />
      );
    case "readglob-group":
      return <ReadGlobGroup items={node.items} />;
    case "plan-review":
      return <PlanReviewCard planContent={node.planContent} planFilePath={node.planFilePath} />;
    case "ask-user-question":
      return <AskUserQuestionCard questions={node.questions} />;
    case "event":
      return <EventNode id={node.id} context={context} />;
  }
}

interface EventNodeProps {
  id: string;
  context: NodeRenderContext;
}

const COLLAPSED_PAGE_SIZE = 100;
const COLLAPSED_EXPANDED_EXCLUDE_PAYLOAD_TYPES = [...HIDDEN_SESSION_PAYLOAD_TYPES, "result"];

function CollapsedEventsNode({
  collapsed,
  context,
}: {
  collapsed: CollapsedSessionEventsSummary;
  context: NodeRenderContext;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [cursor, setCursor] = useState({
    timestamp: collapsed.startTimestamp,
    eventId: collapsed.startEventId,
  });
  const [hasMore, setHasMore] = useState(true);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const scopeKey = eventScopeKey("session", context.sessionId);
  const scopedEvents = useScopedEvents(scopeKey);

  useEffect(() => {
    setOpen(false);
    setLoading(false);
    setError(null);
    setEventIds([]);
    setCursor({ timestamp: collapsed.startTimestamp, eventId: collapsed.startEventId });
    setHasMore(true);
  }, [collapsed.id, collapsed.startEventId, collapsed.startTimestamp]);

  const fetchNext = useCallback(async () => {
    if (!activeOrgId || loading || !hasMore) return;

    setLoading(true);
    setError(null);
    const result = await getClient()
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: context.sessionId },
        limit: COLLAPSED_PAGE_SIZE,
        after: cursor.timestamp,
        afterEventId: cursor.eventId,
        before: collapsed.endTimestamp,
        beforeEventId: collapsed.endEventId,
        excludePayloadTypes: COLLAPSED_EXPANDED_EXCLUDE_PAYLOAD_TYPES,
      })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    const rawEvents = Array.isArray(result.data?.events) ? result.data.events : [];
    const events: Array<Event & { id: string }> = [];
    for (const rawEvent of rawEvents) {
      const event = asFetchedEvent(rawEvent);
      if (event) events.push(event);
    }

    if (events.length > 0) {
      upsertFetchedSessionEventsWithOptimisticResolution(context.sessionId, events);
      setEventIds((current) => {
        const seen = new Set(current);
        const next = [...current];
        for (const event of events) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          next.push(event.id);
        }
        return next;
      });
      setCursor({
        timestamp: events[events.length - 1].timestamp,
        eventId: events[events.length - 1].id,
      });
    }

    setHasMore(events.length === COLLAPSED_PAGE_SIZE);
    setLoading(false);
  }, [
    activeOrgId,
    collapsed.endEventId,
    collapsed.endTimestamp,
    context.sessionId,
    cursor,
    hasMore,
    loading,
  ]);

  const hidden = useMemo(() => buildSessionNodes(eventIds, scopedEvents), [eventIds, scopedEvents]);
  const emptyAfterLoad = open && !loading && !error && !hasMore && hidden.nodes.length === 0;

  const toggleOpen = useCallback(() => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && eventIds.length === 0) {
      void fetchNext();
    }
  }, [eventIds.length, fetchNext, open]);

  const hiddenContext = useMemo<NodeRenderContext>(
    () => ({
      ...context,
      completedAgentTools: hidden.completedAgentTools,
      toolResultByUseId: hidden.toolResultByUseId,
    }),
    [context, hidden.completedAgentTools, hidden.toolResultByUseId],
  );

  if (emptyAfterLoad) return null;

  return (
    <View style={styles.collapsedWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Hide" : "Show"} thinking`}
        onPress={toggleOpen}
        style={({ pressed }) => [
          styles.collapsedHeader,
          {
            backgroundColor:
              pressed || open ? alpha(theme.colors.surfaceElevated, 0.25) : "transparent",
            borderRadius: theme.radius.sm,
            gap: 3,
            paddingHorizontal: 6,
            paddingVertical: 2,
          },
        ]}
      >
        <SymbolView
          name={open ? "chevron.down" : "chevron.right"}
          size={9}
          tintColor={open ? theme.colors.mutedForeground : theme.colors.dimForeground}
          resizeMode="scaleAspectFit"
          style={styles.collapsedChevron}
        />
        <Text
          variant="caption2"
          color={open ? "mutedForeground" : "dimForeground"}
          style={styles.collapsedTitle}
        >
          Show thinking
        </Text>
      </Pressable>

      {open ? (
        <View
          style={[
            styles.collapsedBody,
            {
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xs,
              paddingLeft: 28,
              paddingTop: theme.spacing.xs,
            },
          ]}
        >
          {loading && eventIds.length === 0 ? (
            <View style={styles.collapsedState}>
              <Spinner size={14} />
              <Text variant="caption1" color="mutedForeground">
                Loading intermediate events...
              </Text>
            </View>
          ) : error ? (
            <Text variant="caption1" color="destructive">
              {error}
            </Text>
          ) : (
            hidden.nodes.map((node) => (
              <View key={node.kind === "readglob-group" ? `rg:${node.items[0].id}` : node.id}>
                {renderNode({ node, context: hiddenContext })}
              </View>
            ))
          )}

          {hasMore && !loading && !error ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more intermediate events"
              onPress={() => void fetchNext()}
              style={styles.loadMore}
            >
              <Text variant="caption1" color="mutedForeground">
                Load more
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Reads the event record for a `kind: "event"` node and dispatches on
 * `eventType`. `useSessionNodes` already screens out combinations this
 * switch doesn't handle, but the `default` returns null defensively in
 * case an event mutates after the filter pass.
 */
const EventNode = memo(function EventNode({ id, context }: EventNodeProps) {
  const scopeKey = eventScopeKey("session", context.sessionId);
  const eventType = useScopedEventField(scopeKey, id, "eventType");
  const payload = asJsonObject(useScopedEventField(scopeKey, id, "payload"));
  const actor = useScopedEventField(scopeKey, id, "actor");

  if (!eventType) return null;

  const checkpoints = context.gitCheckpointsByPromptEventId.get(id);

  switch (eventType) {
    case "session_started":
      if (typeof payload?.prompt === "string") {
        return (
          <UserMessageBubble
            text={payload.prompt}
            actorId={actor?.id}
            actorName={actor?.name}
            imageKeys={asStringArray(payload?.attachmentKeys ?? payload?.imageKeys)}
            imagePreviewUrls={asStringArray(payload?.imagePreviewUrls)}
            checkpoints={checkpoints}
          />
        );
      }
      return <SystemBadge text="Session started" />;

    case "message_sent":
      return (
        <UserMessageBubble
          text={typeof payload?.text === "string" ? payload.text : ""}
          actorId={actor?.id}
          actorName={actor?.name}
          imageKeys={asStringArray(payload?.attachmentKeys ?? payload?.imageKeys)}
          imagePreviewUrls={asStringArray(payload?.imagePreviewUrls)}
          checkpoints={checkpoints}
        />
      );

    case "session_output":
      return payload ? renderSessionOutput(payload, context, id) : null;

    case "session_pr_opened":
      return <PRCard kind="opened" prUrl={prUrlFrom(payload)} />;
    case "session_pr_merged":
      return <PRCard kind="merged" prUrl={prUrlFrom(payload)} />;
    case "session_pr_closed":
      return <PRCard kind="closed" prUrl={prUrlFrom(payload)} />;

    default:
      return null;
  }
});

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string") ? value : undefined;
}

function prUrlFrom(payload: JsonObject | undefined): string | null {
  if (!payload) return null;
  if (typeof payload.prUrl === "string") return payload.prUrl;
  const group = asJsonObject(payload.sessionGroup);
  if (group && typeof group.prUrl === "string") return group.prUrl;
  return null;
}

const styles = StyleSheet.create({
  collapsedWrapper: {
    alignItems: "flex-start",
    overflow: "hidden",
  },
  collapsedHeader: {
    alignItems: "center",
    flexDirection: "row",
    maxWidth: "100%",
  },
  collapsedChevron: {
    height: 10,
    width: 10,
  },
  collapsedTitle: {
    fontWeight: "400",
  },
  collapsedBody: {
    alignSelf: "stretch",
  },
  collapsedState: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  loadMore: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
});

export type { NodeRenderContext, PRCardKind };
