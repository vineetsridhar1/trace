import { useEffect, useRef } from "react";
import { SessionMessage } from "./SessionMessage";
import { ReadGlobGroup } from "./messages/ReadGlobGroup";
import { PlanReviewCard } from "./messages/PlanReviewCard";
import { CommandExecutionRow } from "./messages/CommandExecutionRow";
import type { SessionNode } from "./groupReadGlob";

interface SessionMessageListProps {
  eventIds: string[];
  nodes: SessionNode[];
}

export function SessionMessageList({ eventIds, nodes }: SessionMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventIds.length]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex flex-col gap-3">
        {nodes.map((node) =>
          node.kind === "event" ? (
            <SessionMessage key={node.id} id={node.id} />
          ) : node.kind === "command-execution" ? (
            <CommandExecutionRow
              key={node.id}
              command={node.command}
              output={node.output}
              timestamp={node.timestamp}
              exitCode={node.exitCode}
            />
          ) : node.kind === "plan-review" ? (
            <PlanReviewCard
              key={node.id}
              planContent={node.planContent}
              planFilePath={node.planFilePath}
              timestamp={node.timestamp}
            />
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
