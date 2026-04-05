import { useCallback } from "react";
import { useEntityField, useEntityStore } from "../stores/entity";
import { useUIStore, type UIState } from "../stores/ui";
import { useTerminalStore } from "../stores/terminal";
import { client } from "../lib/urql";
import { CREATE_TERMINAL_MUTATION } from "../lib/mutations";

interface RunScript {
  name: string;
  command: string;
}

/**
 * Provides run script state and execution for a session group.
 * The Run button should use `hasRunScripts` to show/hide and `canRun` to enable/disable.
 */
export function useRunScripts(sessionGroupId: string, selectedSessionId: string | null) {
  const setShowTerminalPanel = useUIStore((s: UIState) => s.setShowTerminalPanel);
  const sessionGroupChannel = useEntityField("sessionGroups", sessionGroupId, "channel") as
    | { id: string }
    | null
    | undefined;
  const rawChannelId = useEntityStore((s) =>
    (s.sessionGroups[sessionGroupId] as { channelId?: string | null } | undefined)?.channelId ?? null,
  );
  const channelId = sessionGroupChannel?.id ?? rawChannelId ?? null;
  const runScripts = useEntityField("channels", channelId ?? "", "runScripts") as RunScript[] | null | undefined;
  const setupStatus = useEntityField("sessionGroups", sessionGroupId, "setupStatus") as
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | undefined;
  const setupScript = useEntityField("channels", channelId ?? "", "setupScript") as string | null | undefined;

  const hasRunScripts = Array.isArray(runScripts) && runScripts.length > 0;
  const setupBlocking = Boolean(setupScript) && setupStatus === "running";
  const canRun = hasRunScripts && Boolean(selectedSessionId) && !setupBlocking;

  const handleRun = useCallback(async () => {
    if (!selectedSessionId || !runScripts) return;
    const addTerminal = useTerminalStore.getState().addTerminal;
    for (const script of runScripts) {
      const result = await client
        .mutation(CREATE_TERMINAL_MUTATION, { sessionId: selectedSessionId, cols: 80, rows: 24 })
        .toPromise();
      if (result.data?.createTerminal) {
        const { id } = result.data.createTerminal as { id: string };
        addTerminal(id, selectedSessionId, sessionGroupId, "connecting", {
          customName: script.name,
          initialCommand: script.command,
        });
      }
    }
    setShowTerminalPanel(true);
  }, [selectedSessionId, sessionGroupId, runScripts, setShowTerminalPanel]);

  return { hasRunScripts, canRun, handleRun };
}
