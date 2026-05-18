import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImageIcon, MessageSquareText } from "lucide-react";
import type { Event } from "@trace/gql";
import { attachmentKeysFromPayload, asJsonObject } from "@trace/shared";
import { useScopedEvents } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { useEventScopeKey } from "./EventScopeContext";

interface PromptTimelineNode {
  kind: string;
  id?: string;
}

interface PromptTimelineItem {
  id: string;
  text: string;
  actorName: string;
  timestamp: string;
  imageCount: number;
  widthPercent: number;
  nodeIndex: number;
}

interface PromptTimelineProps {
  nodes: readonly PromptTimelineNode[];
  currentNodeIndex: number | null;
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

function formatPromptTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Prompt";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function promptTextFromEvent(event: Event): { text: string; imageCount: number } | null {
  const payload = asJsonObject(event.payload);
  if (!payload) return null;

  const imageCount = attachmentKeysFromPayload(payload).length;
  const rawText =
    event.eventType === "session_started"
      ? payload.prompt
      : event.eventType === "message_sent"
        ? payload.text
        : undefined;

  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text && imageCount === 0) return null;

  return {
    text: text || (imageCount === 1 ? "Image prompt" : `${imageCount} image prompt`),
    imageCount,
  };
}

function buildPromptTimelineItems(
  nodes: readonly PromptTimelineNode[],
  events: Record<string, Event>,
): PromptTimelineItem[] {
  const items: PromptTimelineItem[] = [];
  const seen = new Set<string>();

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = nodes[nodeIndex];
    if (node.kind !== "event" || !node.id || seen.has(node.id)) continue;
    const event = events[node.id];
    if (!event) continue;

    const prompt = promptTextFromEvent(event);
    if (!prompt) continue;

    seen.add(node.id);
    items.push({
      id: node.id,
      text: prompt.text,
      actorName: event.actor.name ?? "You",
      timestamp: formatPromptTime(event.timestamp),
      imageCount: prompt.imageCount,
      widthPercent: markerWidth(node.id, items.length),
      nodeIndex,
    });
  }

  return items;
}

export function PromptTimeline({ nodes, currentNodeIndex, onSelectPrompt }: PromptTimelineProps) {
  const scopeKey = useEventScopeKey();
  const events = useScopedEvents(scopeKey);
  const [activeId, setActiveId] = useState<string | null>(null);

  const items = useMemo(() => buildPromptTimelineItems(nodes, events), [nodes, events]);
  const currentPromptId = useMemo(() => {
    if (items.length === 0 || currentNodeIndex == null) return null;

    let current = items[0];
    for (const item of items) {
      if (item.nodeIndex > currentNodeIndex) break;
      current = item;
    }
    return current.id;
  }, [currentNodeIndex, items]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-0 top-4 z-20 hidden max-h-[70vh] md:block">
      <div className="relative flex w-14 flex-col items-end gap-0.5 px-1.5 py-2">
        {items.map((item, index) => {
          const active = activeId === item.id;
          const highlighted = active || currentPromptId === item.id;
          return (
            <div key={item.id} className="relative flex w-full justify-end">
              <button
                type="button"
                aria-label={`Jump to prompt ${index + 1}`}
                onClick={() => onSelectPrompt(item.id)}
                onMouseEnter={() => setActiveId(item.id)}
                onMouseLeave={() => setActiveId(null)}
                onFocus={() => setActiveId(item.id)}
                onBlur={() => setActiveId(null)}
                className="pointer-events-auto relative flex h-2 w-full cursor-pointer items-center justify-end rounded-full outline-none"
              >
                <motion.span
                  layout
                  initial={false}
                  animate={{
                    opacity: highlighted ? 1 : 0.28,
                    width: active ? "100%" : `${item.widthPercent}%`,
                  }}
                  transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
                  className={cn(
                    "h-0.5 rounded-full bg-white transition-shadow duration-200",
                    highlighted ? "shadow-lg shadow-white/35" : "shadow-none",
                  )}
                />
              </button>

              <AnimatePresence>
                {active ? (
                  <motion.div
                    initial={{ opacity: 0, x: 10, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 8, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="pointer-events-none absolute right-full top-1/2 mr-3 w-72 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-surface-elevated/95 p-3 text-left backdrop-blur-xl"
                  >
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MessageSquareText size={13} />
                      </span>
                      <span className="truncate">{item.actorName}</span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                      <span>{item.timestamp}</span>
                    </div>
                    <p className="max-h-24 overflow-hidden text-sm leading-5 text-foreground">
                      {item.text}
                    </p>
                    {item.imageCount > 0 ? (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ImageIcon size={12} />
                        <span>
                          {item.imageCount} image{item.imageCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
