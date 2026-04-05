import { Hash } from "lucide-react";
import { useEntityField } from "../../stores/entity";

/**
 * Renders a human-readable reference to a scope (channel, chat, ticket, session).
 * Resolves the entity name from the store by ID.
 */
export function ScopeRef({ scopeType, scopeId }: { scopeType: string; scopeId: string }) {
  const channelName = useEntityField("channels", scopeId, "name");
  const chatName = useEntityField("chats", scopeId, "name");
  const ticketTitle = useEntityField("tickets", scopeId, "title");
  const sessionName = useEntityField("sessions", scopeId, "name");

  const value =
    scopeType === "channel"
      ? channelName
      : scopeType === "chat"
        ? chatName
        : scopeType === "ticket"
          ? ticketTitle
          : scopeType === "session"
            ? sessionName
            : undefined;

  const display = value ?? scopeId.slice(0, 8);
  const icon =
    scopeType === "channel" ? <Hash size={11} className="text-muted-foreground" /> : null;

  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
      {icon}
      <span>{display}</span>
    </span>
  );
}
