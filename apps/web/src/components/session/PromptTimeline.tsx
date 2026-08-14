import { useEffect, useMemo, useState } from "react";
import { formatMessageTimestamp } from "@trace/client-core";
import type { SessionPromptIndexItem } from "../../hooks/useSessionPromptIndex";
import { PromptTimelineMarkerList } from "./PromptTimelineMarkerList";
import { PromptTimelinePreviewCard } from "./PromptTimelinePreviewCard";
import type { PromptTimelineItem } from "./promptTimelineTypes";

const MARKER_ROW_STEP_PX = 10;
const MARKER_LIST_PADDING_TOP_PX = 8;
const TOP_VISIBLE_PREVIEW_PLACEMENT_PX = 24;

interface PromptTimelineNode {
  kind: string;
  id?: string;
}

interface PromptTimelineProps {
  nodes: readonly PromptTimelineNode[];
  prompts: readonly SessionPromptIndexItem[];
  currentNodeIndex: number | null;
  scrollIntentVersion: number;
  onSelectPrompt: (eventId: string) => void;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function markerWidth(id: string, index: number): number {
  return 28 + ((hashString(id) + index * 17) % 36);
}

function buildNodeIndexByEventId(nodes: readonly PromptTimelineNode[]): Map<string, number> {
  const indexByEventId = new Map<string, number>();
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = nodes[nodeIndex];
    if (node.kind === "event" && node.id) {
      indexByEventId.set(node.id, nodeIndex);
    }
  }
  return indexByEventId;
}

function buildPromptTimelineItems(
  prompts: readonly SessionPromptIndexItem[],
  nodeIndexByEventId: Map<string, number>,
): PromptTimelineItem[] {
  return prompts.map((prompt, index) => ({
    id: prompt.eventId,
    text: prompt.preview,
    actorName: prompt.actor.name ?? "You",
    timestamp: formatMessageTimestamp(prompt.timestamp),
    imageCount: prompt.imageCount,
    widthPercent: markerWidth(prompt.eventId, index),
    nodeIndex: nodeIndexByEventId.get(prompt.eventId) ?? null,
  }));
}

function currentPromptIdForNode(
  items: readonly PromptTimelineItem[],
  currentNodeIndex: number | null,
): string | null {
  if (items.length === 0 || currentNodeIndex == null) return null;

  let current: PromptTimelineItem | null = null;
  for (const item of items) {
    if (item.nodeIndex == null) continue;
    if (item.nodeIndex > currentNodeIndex) break;
    current = item;
  }
  return current?.id ?? null;
}

export function PromptTimeline({
  nodes,
  prompts,
  currentNodeIndex,
  scrollIntentVersion,
  onSelectPrompt,
}: PromptTimelineProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markerScrollTop, setMarkerScrollTop] = useState(0);

  const nodeIndexByEventId = useMemo(() => buildNodeIndexByEventId(nodes), [nodes]);
  const items = useMemo(
    () => buildPromptTimelineItems(prompts, nodeIndexByEventId),
    [nodeIndexByEventId, prompts],
  );
  const currentPromptId = useMemo(
    () => currentPromptIdForNode(items, currentNodeIndex),
    [currentNodeIndex, items],
  );
  const selectedPromptId =
    selectedId && items.some((item) => item.id === selectedId) ? selectedId : null;
  const activePreview = activeId
    ? items
        .map((item, index) => ({ item, index }))
        .find((entry) => entry.item.id === activeId) ?? null
    : null;
  const activePreviewTop = activePreview
    ? MARKER_LIST_PADDING_TOP_PX + activePreview.index * MARKER_ROW_STEP_PX - markerScrollTop
    : 0;
  const activePreviewPlacement =
    activePreviewTop < TOP_VISIBLE_PREVIEW_PLACEMENT_PX ? "below" : "center";

  useEffect(() => {
    setSelectedId(null);
  }, [scrollIntentVersion]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-0 top-4 z-20 hidden md:block">
      <PromptTimelineMarkerList
        items={items}
        activeId={activeId}
        selectedPromptId={selectedPromptId}
        currentPromptId={currentPromptId}
        onActiveChange={setActiveId}
        onSelect={(id) => {
          setSelectedId(id);
          onSelectPrompt(id);
        }}
        onScroll={setMarkerScrollTop}
      />
      <PromptTimelinePreviewCard
        preview={activePreview}
        top={activePreviewTop}
        placement={activePreviewPlacement}
      />
    </div>
  );
}
