import { useEffect, useRef } from "react";
import { SessionMessage } from "./SessionMessage";

interface SessionMessageListProps {
  eventIds: string[];
}

export function SessionMessageList({ eventIds }: SessionMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventIds.length]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex flex-col gap-3">
        {eventIds.map((id) => (
          <SessionMessage key={id} id={id} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
