import { useEffect, useRef, useMemo } from "react";
import { SessionMessage } from "./SessionMessage";
import { ReadGlobGroup } from "./messages/ReadGlobGroup";
import { buildSessionNodes } from "./groupReadGlob";
import { useEntityStore } from "../../stores/entity";

interface SessionMessageListProps {
  eventIds: string[];
}

export function SessionMessageList({ eventIds }: SessionMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const events = useEntityStore((s) => s.events);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventIds.length]);

  const nodes = useMemo(
    () => buildSessionNodes(eventIds, events),
    [eventIds, events],
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex flex-col gap-3">
        {nodes.map((node) =>
          node.kind === "event" ? (
            <SessionMessage key={node.id} id={node.id} />
          ) : (
            <ReadGlobGroup
              key={node.items[0].id}
              items={node.items}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
