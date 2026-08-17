import { useCallback } from "react";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { RepoApplicationConfig } from "@trace/gql";
import { requestSessionTerminal } from "../lib/terminal-creation";

interface LegacyRunScript {
  name: string;
  command: string;
}

/**
 * Provides run script state and execution for a session group.
 * The Run button should use `hasRunScripts` to show/hide and `canRun` to enable/disable.
 */
export function useRunScripts(sessionGroupId: string, selectedSessionId: string | null) {
  const sessionGroupChannel = useEntityField("sessionGroups", sessionGroupId, "channel") as
    | { id: string }
    | null
    | undefined;
  const rawChannelId = useEntityStore(
    (s) =>
      (s.sessionGroups[sessionGroupId] as { channelId?: string | null } | undefined)?.channelId ??
      null,
  );
  const channelId = sessionGroupChannel?.id ?? rawChannelId ?? null;
  const channelRepo = useEntityField("channels", channelId ?? "", "repo") as
    | { id: string }
    | null
    | undefined;
  const repoApplicationConfig = useEntityField(
    "repos",
    channelRepo?.id ?? "",
    "applicationConfig",
  ) as RepoApplicationConfig | null | undefined;
  const channelRunScripts = useEntityField("channels", channelId ?? "", "runScripts") as
    | LegacyRunScript[]
    | null
    | undefined;
  const runScripts = repoApplicationConfig?.runScripts ?? channelRunScripts;
  const setupStatus = useEntityField("sessionGroups", sessionGroupId, "setupStatus") as
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | undefined;
  const setupScript = useEntityField("channels", channelId ?? "", "setupScript") as
    | string
    | null
    | undefined;

  const hasRunScripts = Array.isArray(runScripts) && runScripts.length > 0;
  const setupBlocking = Boolean(setupScript) && setupStatus === "running";
  const canRun = hasRunScripts && Boolean(selectedSessionId) && !setupBlocking;

  const handleRun = useCallback(async () => {
    if (!selectedSessionId || !runScripts) return;
    for (const script of runScripts) {
      await requestSessionTerminal({
        sessionId: selectedSessionId,
        customName: script.name,
        initialCommand: script.command,
        showPanel: true,
      }).completion;
    }
  }, [selectedSessionId, runScripts]);

  return { hasRunScripts, canRun, handleRun };
}
