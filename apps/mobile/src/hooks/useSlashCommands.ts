import { useEffect, useState } from "react";
import { SESSION_SLASH_COMMANDS_QUERY, useEntityField } from "@trace/client-core";
import { BUILTIN_SLASH_COMMANDS } from "@trace/shared";
import { getClient } from "@/lib/urql";
import type { SessionSlashCommand } from "@/lib/slashCommands";

const BUILTIN_FALLBACK: SessionSlashCommand[] = BUILTIN_SLASH_COMMANDS.map((command) => ({
  ...command,
  source: "builtin",
}));

const slashCommandCache = new Map<string, SessionSlashCommand[]>();
const slashCommandRequests = new Map<string, Promise<SessionSlashCommand[] | null>>();

function fetchSlashCommands(sessionId: string): Promise<SessionSlashCommand[] | null> {
  const pendingRequest = slashCommandRequests.get(sessionId);
  if (pendingRequest) return pendingRequest;

  const request = getClient()
    .query<{ sessionSlashCommands: SessionSlashCommand[] }>(
      SESSION_SLASH_COMMANDS_QUERY,
      { sessionId },
      { requestPolicy: "network-only" },
    )
    .toPromise()
    .then((result) => {
      if (result.error || !result.data?.sessionSlashCommands) {
        return null;
      }

      const nextCommands = result.data.sessionSlashCommands;
      if (nextCommands.length > 0) {
        slashCommandCache.set(sessionId, nextCommands);
      }

      return nextCommands;
    })
    .catch(() => null)
    .finally(() => {
      slashCommandRequests.delete(sessionId);
    });

  slashCommandRequests.set(sessionId, request);
  return request;
}

export function useSlashCommands(sessionId: string): {
  commands: SessionSlashCommand[];
  loading: boolean;
} {
  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const isClaudeSession = tool === "claude_code";
  const [commands, setCommands] = useState<SessionSlashCommand[]>(() => {
    if (!isClaudeSession) return [];
    return slashCommandCache.get(sessionId) ?? BUILTIN_FALLBACK;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || !isClaudeSession) {
      setCommands([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cachedCommands = slashCommandCache.get(sessionId);
    setCommands(cachedCommands ?? BUILTIN_FALLBACK);
    setLoading(cachedCommands == null);

    void fetchSlashCommands(sessionId)
      .then((nextCommands) => {
        if (cancelled || !nextCommands || nextCommands.length === 0) return;
        setCommands(nextCommands);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isClaudeSession, sessionId]);

  return { commands, loading };
}
