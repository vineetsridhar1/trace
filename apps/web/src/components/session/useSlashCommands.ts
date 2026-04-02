import { useEffect, useState } from "react";
import { BUILTIN_SLASH_COMMANDS } from "@trace/shared";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { SESSION_SLASH_COMMANDS_QUERY } from "../../lib/mutations";
import type { SlashCommandItem } from "../chat/ChatEditor";

const BUILTIN_FALLBACK: SlashCommandItem[] = BUILTIN_SLASH_COMMANDS.map((cmd: { name: string; description: string; category: string }) => ({
  id: cmd.name,
  value: cmd.name,
  description: cmd.description,
  source: "builtin",
  category: cmd.category,
  type: "slash_command" as const,
}));

export function useSlashCommands(sessionId: string): { commands: SlashCommandItem[]; loading: boolean } {
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const [commands, setCommands] = useState<SlashCommandItem[]>(() =>
    tool === "claude_code" ? BUILTIN_FALLBACK : [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setCommands([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const shouldSeedBuiltins = tool === "claude_code";
    setCommands(shouldSeedBuiltins ? BUILTIN_FALLBACK : []);
    setLoading(true);
    client
      .query(SESSION_SLASH_COMMANDS_QUERY, { sessionId })
      .toPromise()
      .then((result: { error?: unknown; data?: Record<string, unknown> }) => {
        if (cancelled) return;
        if (result.error || !result.data?.sessionSlashCommands) {
          return;
        }
        const mapped: SlashCommandItem[] = (result.data.sessionSlashCommands as Array<{ name: string; description: string; source: string; category: string }>).map(
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
