import { useEffect, useState, useRef } from "react";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { SESSION_SLASH_COMMANDS_QUERY } from "../../lib/mutations";
import type { SlashCommandItem } from "../chat/ChatEditor";

const BUILTIN_FALLBACK: SlashCommandItem[] = [
  { id: "clear", value: "clear", description: "Start a new session", source: "builtin", category: "special", type: "slash_command" },
  { id: "compact", value: "compact", description: "Compact conversation context", source: "builtin", category: "terminal", type: "slash_command" },
  { id: "cost", value: "cost", description: "Show token usage and cost", source: "builtin", category: "terminal", type: "slash_command" },
  { id: "model", value: "model", description: "Switch model", source: "builtin", category: "terminal", type: "slash_command" },
  { id: "help", value: "help", description: "Show help information", source: "builtin", category: "terminal", type: "slash_command" },
];

export function useSlashCommands(sessionId: string): { commands: SlashCommandItem[]; loading: boolean } {
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const [commands, setCommands] = useState<SlashCommandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (tool !== "claude_code") {
      setCommands([]);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    setLoading(true);
    client
      .query(SESSION_SLASH_COMMANDS_QUERY, { sessionId })
      .toPromise()
      .then((result) => {
        if (result.error || !result.data?.sessionSlashCommands) {
          setCommands(BUILTIN_FALLBACK);
          return;
        }
        const mapped: SlashCommandItem[] = result.data.sessionSlashCommands.map(
          (cmd: { name: string; description: string; source: string; category: string }) => ({
            id: cmd.name,
            value: cmd.name,
            description: cmd.description,
            source: cmd.source,
            category: cmd.category,
            type: "slash_command" as const,
          }),
        );
        setCommands(mapped);
      })
      .catch(() => {
        setCommands(BUILTIN_FALLBACK);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId, tool]);

  return { commands, loading };
}
