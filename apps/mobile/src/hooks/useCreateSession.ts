import { useCallback, useEffect, useState } from "react";
import {
  AVAILABLE_RUNTIMES_QUERY,
  START_SESSION_MUTATION,
} from "@trace/client-core";
import type {
  CodingTool,
  HostingMode,
  SessionRuntimeInstance,
} from "@trace/gql";
import { getClient } from "@/lib/urql";

/** Sentinel runtime id mirroring web's RuntimeSelector — means "use cloud". */
export const CLOUD_RUNTIME_ID = "__cloud__";

export interface CreateSessionInput {
  tool: CodingTool;
  model?: string;
  runtimeId: string;
  channelId: string;
  repoId?: string;
  prompt?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  sessionGroupId: string;
}

export function useAvailableRuntimes(tool: CodingTool) {
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClient()
      .query(AVAILABLE_RUNTIMES_QUERY, { tool })
      .toPromise()
      .then((result: { data?: { availableRuntimes?: SessionRuntimeInstance[] } }) => {
        if (cancelled) return;
        setRuntimes(result.data?.availableRuntimes ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tool]);

  return { runtimes, loading };
}

export function useCreateSession() {
  const [submitting, setSubmitting] = useState(false);

  const createSession = useCallback(
    async (input: CreateSessionInput): Promise<CreateSessionResult> => {
      setSubmitting(true);
      try {
        const isCloud = input.runtimeId === CLOUD_RUNTIME_ID;
        const trimmedPrompt = input.prompt?.trim();
        const result = await getClient()
          .mutation<{ startSession: { id: string; sessionGroupId: string } }>(
            START_SESSION_MUTATION,
            {
              input: {
                tool: input.tool,
                model: input.model,
                hosting: isCloud ? ("cloud" as HostingMode) : undefined,
                runtimeInstanceId: isCloud ? undefined : input.runtimeId,
                channelId: input.channelId,
                repoId: input.repoId,
                prompt: trimmedPrompt ? trimmedPrompt : undefined,
              },
            },
          )
          .toPromise();
        if (result.error) throw result.error;
        const session = result.data?.startSession;
        if (!session?.id || !session.sessionGroupId) {
          throw new Error("Server did not return a session id");
        }
        return {
          sessionId: session.id,
          sessionGroupId: session.sessionGroupId,
        };
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { createSession, submitting };
}
