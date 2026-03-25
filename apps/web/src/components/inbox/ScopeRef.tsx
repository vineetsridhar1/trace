import { Hash } from "lucide-react";
import { useEntityField } from "../../stores/entity";

/**
 * Renders a human-readable reference to a scope (channel, chat, ticket, session).
 * Resolves the entity name from the store by ID.
 */
export function ScopeRef({ scopeType, scopeId }: { scopeType: string; scopeId: string }) {
  // Tickets use "title", everything else uses "name"
  const isTicket = scopeType === "ticket";

  const entityType = scopeType === "channel" ? "channels" as const
    : scopeType === "chat" ? "chats" as const
    : scopeType === "ticket" ? "tickets" as const
    : scopeType === "session" ? "sessions" as const
    : null;

  const field = isTicket ? "title" : "name";
  const value = useEntityField(entityType ?? "channels", entityType ? scopeId : "", field) as string | undefined;

  const display = value ?? scopeId.slice(0, 8);
  const icon = scopeType === "channel" ? <Hash size={11} className="text-muted-foreground" /> : null;

  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
      {icon}
      <span>{display}</span>
    </span>
  );
}
