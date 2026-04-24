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

function getRuntimeInstanceId(connection: unknown): string | null {
  if (
    !connection ||
    typeof connection !== "object" ||
    Array.isArray(connection) ||
    typeof (connection as { runtimeInstanceId?: unknown }).runtimeInstanceId !== "string"
  ) {
    return null;
  }

  return (connection as { runtimeInstanceId?: string }).runtimeInstanceId ?? null;
}

function getSlashCommandCacheKey(
  sessionId: string,
  runtimeInstanceId: string | null,
  workdir: string | null | undefined,
): string {
  return `${sessionId}::${runtimeInstanceId ?? ""}::${workdir ?? ""}`;
}

function fetchSlashCommands(
  cacheKey: string,
  sessionId: string,
): Promise<SessionSlashCommand[] | null> {
  const pendingRequest = slashCommandRequests.get(cacheKey);
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
        slashCommandCache.set(cacheKey, nextCommands);
      }

      return nextCommands;
    })
    .catch(() => null)
    .finally(() => {
      slashCommandRequests.delete(cacheKey);
    });

  slashCommandRequests.set(cacheKey, request);
  return request;
}

export function useSlashCommands(sessionId: string): {
  commands: SessionSlashCommand[];
  loading: boolean;
} {
  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const connection = useEntityField("sessions", sessionId, "connection");
  const workdir = useEntityField("sessions", sessionId, "workdir") as string | null | undefined;
  const isClaudeSession = tool === "claude_code";
  const runtimeInstanceId = getRuntimeInstanceId(connection);
  const cacheKey = getSlashCommandCacheKey(sessionId, runtimeInstanceId, workdir);
  const [commands, setCommands] = useState<SessionSlashCommand[]>(() => {
    if (!isClaudeSession) return [];
    return slashCommandCache.get(cacheKey) ?? BUILTIN_FALLBACK;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || !isClaudeSession) {
      setCommands([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cachedCommands = slashCommandCache.get(cacheKey);
    setCommands(cachedCommands ?? BUILTIN_FALLBACK);
    setLoading(cachedCommands == null);

    void fetchSlashCommands(cacheKey, sessionId)
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
  }, [cacheKey, isClaudeSession, sessionId]);

  return { commands, loading };
}
