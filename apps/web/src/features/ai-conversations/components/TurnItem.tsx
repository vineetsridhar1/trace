import { useState } from "react";
import { motion } from "framer-motion";
import { useTurnField } from "../hooks/useAiConversationSelectors";
import { Markdown } from "../../../components/ui/Markdown";
import { cn } from "../../../lib/utils";
import { User, Bot } from "lucide-react";

interface TurnItemProps {
  turnId: string;
  inherited?: boolean;
}

export function TurnItem({ turnId, inherited }: TurnItemProps) {
  const role = useTurnField(turnId, "role");
  const content = useTurnField(turnId, "content");
  const createdAt = useTurnField(turnId, "createdAt");
  const isOptimistic = useTurnField(turnId, "_optimistic");
  const [showTimestamp, setShowTimestamp] = useState(false);

  if (!role || content === undefined) return null;

  const isUser = role === "USER";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group relative px-4 py-2",
        inherited && "opacity-60",
      )}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
        {/* Avatar */}
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isUser ? <User size={14} /> : <Bot size={14} />}
        </div>

        {/* Content bubble */}
        <div
          className={cn(
            "max-w-[80%] rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
            isOptimistic && "opacity-70",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <Markdown>{content ?? ""}</Markdown>
          )}
        </div>
      </div>

      {/* Timestamp on hover */}
      {showTimestamp && createdAt && (
        <div
          className={cn(
            "absolute top-1 text-[10px] text-muted-foreground",
            isUser ? "left-4" : "right-4",
          )}
        >
          {formatTimestamp(createdAt)}
        </div>
      )}
    </motion.div>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
