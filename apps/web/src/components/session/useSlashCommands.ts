import { useEffect, useState } from "react";
import { BUILTIN_SLASH_COMMANDS } from "@trace/shared";
import { useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import { SESSION_SLASH_COMMANDS_QUERY } from "@trace/client-core";
import type { SlashCommandItem } from "../chat/ChatEditor";

const BUILTIN_FALLBACK: SlashCommandItem[] = BUILTIN_SLASH_COMMANDS.map(
  (cmd: { name: string; description: string; category: string }) => ({
    id: cmd.name,
    value: cmd.name,
    description: cmd.description,
    source: "builtin",
    category: cmd.category,
    type: "slash_command" as const,
  }),
);

const SESSION_ACTION_FALLBACK = BUILTIN_FALLBACK.filter(
  (command) => command.category === "special",
);

const PI_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: "login",
    value: "login",
    description: "Open Pi login in a terminal",
    source: "builtin",
    category: "auth",
    type: "slash_command",
  },
];

export function useSlashCommands(sessionId: string): {
  commands: SlashCommandItem[];
  loading: boolean;
} {
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const [commands, setCommands] = useState<SlashCommandItem[]>(() =>
    tool === "claude_code"
      ? BUILTIN_FALLBACK
      : tool === "pi"
        ? PI_SLASH_COMMANDS
        : SESSION_ACTION_FALLBACK,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setCommands([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const localCommands =
      tool === "pi"
        ? PI_SLASH_COMMANDS
        : tool === "claude_code"
          ? BUILTIN_FALLBACK
          : SESSION_ACTION_FALLBACK;
    setCommands(localCommands);
    if (tool === "pi") {
      setLoading(false);
      return;
    }
    setLoading(true);
    client
      .query(SESSION_SLASH_COMMANDS_QUERY, { sessionId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result: { error?: unknown; data?: Record<string, unknown> }) => {
        if (cancelled) return;
        if (result.error || !result.data?.sessionSlashCommands) {
          return;
        }
        const raw = result.data.sessionSlashCommands as Array<{
          name: string;
          description: string;
          source: string;
          category: string;
        }>;
        // An empty response can mean the runtime has not connected yet. Keep
        // the locally handled commands (such as /clear) until a runtime can
        // report its user and project skills.
        if (raw.length === 0) {
          return;
        }
        const mapped: SlashCommandItem[] = raw.map(
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
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, tool]);

  return { commands, loading };
}
