import { useEffect, useState } from "react";
import { SESSION_SLASH_COMMANDS_QUERY, useEntityField } from "@trace/client-core";
import { BUILTIN_SLASH_COMMANDS } from "@trace/shared";
import { getClient } from "@/lib/urql";
import type { SessionSlashCommand } from "@/lib/slashCommands";

const BUILTIN_FALLBACK: SessionSlashCommand[] = BUILTIN_SLASH_COMMANDS.map((command) => ({
  ...command,
  source: "builtin",
}));

export function useSlashCommands(
  sessionId: string,
): { commands: SessionSlashCommand[]; loading: boolean } {
  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const [commands, setCommands] = useState<SessionSlashCommand[]>(() =>
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

    void getClient()
      .query<{ sessionSlashCommands: SessionSlashCommand[] }>(
        SESSION_SLASH_COMMANDS_QUERY,
        { sessionId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.data?.sessionSlashCommands) {
          return;
        }

        const nextCommands = result.data.sessionSlashCommands;
        if (shouldSeedBuiltins && nextCommands.length === 0) {
          return;
        }

        setCommands(nextCommands);
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
